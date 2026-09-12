"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { orderItems, orderPromocodes, orders } from "@/db/schema";
import { currentUser } from "@/auth";
import { readCart, resolveCart, writeCart } from "@/lib/cart";
import { checkPromocode, consumePromocode } from "@/lib/promocodes-db";
import { discountLabel, urgentFee } from "@/lib/promocodes";
import { createAccountingForSiteOrder } from "@/lib/accounting-db";
import { notifyNewOrder } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";

export type CheckoutState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type PromoState = {
  ok?: boolean;
  message?: string;
  /** Код и скидка, если он подошёл - форма показывает их в итоге. */
  code?: string;
  discount?: number;
  label?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const schema = z.object({
  name: z.string().trim().min(2, "Имя от двух букв").max(100),
  email: z.email("Похоже, адрес с опечаткой"),
  phone: z.string().trim().min(6, "Впишите телефон").max(20),
  address: z.string().trim().min(10, "Адрес слишком короткий").max(500),
  comment: z.string().trim().max(1000).optional(),
});

/**
 * Проверка промокода до оформления.
 *
 * Сумма берётся из корзины на сервере, а не из формы: иначе скидку можно
 * было бы выпросить под выдуманный итог.
 */
export async function applyPromocode(
  _prev: PromoState,
  formData: FormData,
): Promise<PromoState> {
  const items = await resolveCart(await readCart());
  if (items.length === 0) return { ok: false, message: "Корзина пуста" };

  // Промокод анонимный, поэтому ограничиваем по адресу: иначе действующие
  // коды можно было бы вычислить перебором словаря
  const ip = await clientIp();
  const limit = await checkRateLimit(ip, "promo");
  if (!limit.ok) {
    return { ok: false, message: `Слишком много попыток. Попробуйте ${retryAfterText(limit.retryAfter)}` };
  }
  await recordAttempt(ip, "promo");

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const urgent = String(formData.get("isUrgent") ?? "") === "1";
  const base = subtotal + urgentFee(subtotal, urgent);

  const result = await checkPromocode(String(formData.get("promoCode") ?? ""), base);
  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    code: result.rule.code,
    discount: result.discount,
    label: discountLabel(result.rule),
    message: `Промокод ${result.rule.code}: скидка ${result.discount.toFixed(2)} ₽`,
  };
}

/**
 * Оформление заказа с витрины.
 *
 * Всё считается заново по базе: цены позиций, надбавка за срочность и
 * скидка. Из формы приходят только контакты и намерения - сумма,
 * пришедшая из браузера, ни на что не влияет.
 *
 * Заказ, позиции, промокод и бухгалтерская карточка пишутся одной
 * транзакцией: заказ без карточки не виден ни в бухгалтерии, ни в
 * аналитике.
 */
export async function placeOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Колонка orders.user_id обязательная: заказ без аккаунта в этой
  // схеме не живёт, да и смотреть его клиенту было бы негде
  const user = await currentUser();
  if (!user) return { error: "Чтобы оформить заказ, войдите в кабинет" };

  const ip = await clientIp();
  const limit = await checkRateLimit(ip, "checkout");
  if (!limit.ok) {
    return {
      error: `Слишком много заказов подряд. Следующий можно ${retryAfterText(limit.retryAfter)}`,
    };
  }

  const lines = await readCart();
  const items = await resolveCart(lines);
  if (items.length === 0) return { error: "Корзина пуста" };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const v = parsed.data;
  const isUrgent = String(formData.get("isUrgent") ?? "") === "1";

  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const fee = urgentFee(subtotal, isUrgent);
  const beforeDiscount = round2(subtotal + fee);

  const rawPromo = String(formData.get("promoCode") ?? "").trim();
  const promo = rawPromo ? await checkPromocode(rawPromo, beforeDiscount) : null;
  if (promo && !promo.ok) return { fieldErrors: { promoCode: promo.message } };

  const discount = promo?.ok ? promo.discount : 0;
  const total = round2(Math.max(0, beforeDiscount - discount));

  await recordAttempt(ip, "checkout");

  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        userId: Number(user.id),
        totalPrice: total.toFixed(2),
        isUrgent,
        status: "pending",
        isNew: true,
        shippingAddress: v.address,
        // Старый сайт клал сюда JSON: контакты на момент заказа плюс
        // детали расчёта. Формат сохраняем - его читает parseContact
        contactInfo: JSON.stringify({
          name: v.name,
          email: v.email,
          phone: v.phone,
          comment: v.comment ?? "",
          is_urgent: isUrgent,
          original_total_price: subtotal,
          urgent_fee: fee,
          promo_data: promo?.ok
            ? {
                code: promo.rule.code,
                discount_type: promo.rule.discountType,
                discount_value: promo.rule.discountValue,
                discount,
              }
            : null,
        }),
      })
      .returning({ id: orders.id });

    await tx.insert(orderItems).values(
      items.map((i) => ({
        orderId: order.id,
        productId: i.productId,
        isCustom: false,
        itemName: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toFixed(2),
        // Колонка price хранит сумму строки целиком - так же, как у
        // заказов менеджера
        price: round2(i.lineTotal).toFixed(2),
        attributes: i.options.length > 0 ? i.options : null,
      })),
    );

    if (promo?.ok) {
      await tx.insert(orderPromocodes).values({
        orderId: order.id,
        promoCode: promo.rule.code,
        discountType: promo.rule.discountType === "fixed" ? "fixed" : "percentage",
        discountValue: promo.rule.discountValue,
        appliedDiscount: discount.toFixed(2),
      });
      await consumePromocode(tx, promo.rule.code);
    }

    await createAccountingForSiteOrder(tx, {
      id: order.id,
      clientName: v.name,
      income: total.toFixed(2),
    });

    return order.id;
  });

  await writeCart([]);

  await audit("order.create", { type: "order", id: orderId }, {
    total: total.toFixed(2),
    items: items.length,
    urgent: isUrgent,
    promo: promo?.ok ? promo.rule.code : null,
  });

  await notifyNewOrder({
    orderId,
    clientName: v.name,
    total,
    urgent: isUrgent,
  });

  revalidatePath("/cart");
  revalidatePath("/client/orders");
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  redirect(`/client/orders/${orderId}?new=1`);
}
