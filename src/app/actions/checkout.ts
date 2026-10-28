"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderPromocodes, orders, users } from "@/db/schema";
import { currentUser } from "@/auth";
import { readCart, resolveCart, writeCart } from "@/lib/cart";
import {
  checkPromocode,
  consumePromocode,
  PromoUnavailableError,
  type PromoCheck,
} from "@/lib/promocodes-db";
import { discountLabel, urgentFee } from "@/lib/promocodes";
import { recalcOrderMoney } from "@/lib/order-money-db";
import { notifyNewOrder } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { buyerSnapshot, itemSnapshotName } from "@/lib/order-snapshot";
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

/**
 * Ключи счётчика перебора промокодов: адрес и, если человек вошёл, его
 * аккаунт. Одного адреса мало - его меняют, а аккаунт для оформления
 * нужен всё равно.
 */
function promoLimitKeys(ip: string, userId?: string) {
  return userId ? [ip, `promo-user:${userId}`] : [ip];
}

async function promoLimitVerdict(keys: string[]) {
  let wait = 0;
  for (const key of keys) {
    const v = await checkRateLimit(key, "promo");
    if (!v.ok) wait = Math.max(wait, v.retryAfter);
  }
  return wait === 0 ? null : `Слишком много попыток. Попробуйте ${retryAfterText(wait)}`;
}

async function recordPromoAttempt(keys: string[]) {
  for (const key of keys) await recordAttempt(key, "promo");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Заказ, уже оформленный с этим ключом, - если он есть и принадлежит
 * этому клиенту. Чужой ключ ничего не открывает.
 */
async function orderByToken(token: string, userId: number) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.checkoutToken, token), eq(orders.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

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
  // коды можно было бы вычислить перебором словаря. Вошедшего считаем ещё
  // и по аккаунту. Счётчик общий с оформлением заказа, поэтому пишем в
  // него только неудачи: перебор - это неверные коды, а человек, который
  // жмёт «Проверить» на верном, не должен потом упереться в лимит при
  // оформлении
  const user = await currentUser();
  const keys = promoLimitKeys(await clientIp(), user?.id);
  const tooMany = await promoLimitVerdict(keys);
  if (tooMany) return { ok: false, message: tooMany };

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const urgent = String(formData.get("isUrgent") ?? "") === "1";
  const base = subtotal + urgentFee(subtotal, urgent);

  const result = await checkPromocode(String(formData.get("promoCode") ?? ""), base, {
    userId: user ? Number(user.id) : undefined,
  });
  if (!result.ok) {
    await recordPromoAttempt(keys);
    return { ok: false, message: result.message };
  }

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

  // Ключ оформления приходит из скрытого поля формы. Двойной щелчок или
  // повтор запроса несёт тот же ключ: вместо второго заказа отправляем
  // на уже созданный. Смотрим до проверки корзины - после первого заказа
  // она пуста, и повтор получил бы «Корзина пуста».
  const rawToken = String(formData.get("checkoutToken") ?? "").trim().toLowerCase();
  const checkoutToken = UUID_RE.test(rawToken) ? rawToken : null;
  // Повтор уже оформленного заказа ведёт на него. Зовётся и перед отказом
  // по промокоду: при двойной отправке первый запрос мог успеть списать
  // одноразовый код, и второй получил бы «код уже использован» вместо заказа
  const redirectIfPlaced = async () => {
    if (!checkoutToken) return;
    const existing = await orderByToken(checkoutToken, Number(user.id));
    if (existing !== null) redirect(`/client/orders/${existing}?new=1`);
  };
  await redirectIfPlaced();

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

  // Оформление - тоже проверка кода: без того же счётчика перебор просто
  // перешёл бы сюда из applyPromocode. Как и там, считаем только неудачи.
  // Отказ уходит в fieldErrors.promoCode - форма показывает его у поля
  // промокода, заказ не создаётся
  const rawPromo = String(formData.get("promoCode") ?? "").trim();
  const promoKeys = promoLimitKeys(ip, user.id);
  let promo: PromoCheck | null = null;
  if (rawPromo) {
    const tooMany = await promoLimitVerdict(promoKeys);
    if (tooMany) {
      await redirectIfPlaced();
      return { fieldErrors: { promoCode: tooMany } };
    }

    promo = await checkPromocode(rawPromo, beforeDiscount, { userId: Number(user.id) });
    if (!promo.ok) {
      await redirectIfPlaced();
      await recordPromoAttempt(promoKeys);
      return { fieldErrors: { promoCode: promo.message } };
    }
  }

  const discount = promo?.ok ? promo.discount : 0;
  const total = round2(Math.max(0, beforeDiscount - discount));

  // Реквизиты покупателя на момент заказа: счёт и УПД по этому заказу
  // потом не должны поменяться вслед за профилем
  const [profile] = await db
    .select({
      isCorporate: users.isCorporate,
      companyName: users.companyName,
      inn: users.inn,
      kpp: users.kpp,
      legalAddress: users.legalAddress,
    })
    .from(users)
    .where(eq(users.id, Number(user.id)))
    .limit(1);

  await recordAttempt(ip, "checkout");

  let orderId: number;
  try {
    orderId = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          userId: Number(user.id),
          totalPrice: total.toFixed(2),
          isUrgent,
          checkoutToken,
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
            ...(profile ? buyerSnapshot(profile) : {}),
          }),
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        items.map((i) => ({
          orderId: order.id,
          productId: i.productId,
          isCustom: false,
          // Название с выбранными характеристиками и единица - снимок на
          // момент заказа: товар потом переименуют или уберут
          itemName: itemSnapshotName(i.name, i.options),
          productName: i.name.slice(0, 255),
          unit: i.unit,
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
        // Лимит и одноразовость - ещё раз, уже под блокировкой строки
        // кода: проверка выше была вне транзакции, и параллельный заказ
        // мог успеть выбрать последнее использование
        await consumePromocode(tx, promo.rule.code, {
          userId: Number(user.id),
          orderId: order.id,
        });
      }

      // Карточку бухгалтерии заводит общий пересчёт - той же транзакцией:
      // заказ без неё не виден ни в бухгалтерии, ни в аналитике
      await recalcOrderMoney(
        tx,
        { source: "site", id: order.id },
        { rebuildTotal: true, refreshEstimate: true },
      );

      return order.id;
    });
  } catch (error) {
    // Ловим только отказ по промокоду: заказ откатился целиком, форма
    // покажет причину у поля промокода, и человеку достаточно убрать или
    // сменить код. Остальные ошибки - настоящие сбои, их не прячем
    if (error instanceof PromoUnavailableError) {
      await redirectIfPlaced();
      return { fieldErrors: { promoCode: error.message } };
    }
    // Параллельный повтор с тем же ключом успел раньше: заказ уже есть,
    // эта попытка откатилась целиком (вместе с промокодом)
    if (checkoutToken && isUniqueViolation(error, "orders_checkout_token_unique")) {
      await redirectIfPlaced();
      return { error: "Не удалось оформить заказ. Обновите страницу и попробуйте ещё раз" };
    }
    throw error;
  }

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
