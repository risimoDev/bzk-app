"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  commercialOfferItems,
  commercialOffers,
  externalOrderItems,
  externalOrders,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { createAccountingForExternalOrder } from "@/lib/accounting-db";

export type OfferState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
type OfferStatus = (typeof STATUSES)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

const toNumber = (raw: FormDataEntryValue | null | undefined) => {
  const text = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/**
 * Новое коммерческое предложение.
 *
 * Номер - год и порядковый номер за год. Заказчика можно выбрать из
 * справочника контрагентов: КП чаще всего пишут тому, с кем уже
 * разговаривали, и после «принято» из него сразу заводится заказ.
 */
export async function createOffer(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const me = await currentUser();
  if (!me || !(await can("documents", "create"))) {
    return { error: "У вашей роли нет права заводить КП" };
  }

  const rawClient = String(formData.get("clientId") ?? "").trim();
  const clientId: number | null = rawClient === "" ? null : Number(rawClient);
  if (clientId !== null && (!Number.isInteger(clientId) || clientId <= 0)) {
    return { fieldErrors: { clientId: "Контрагент не найден" } };
  }

  let clientName = String(formData.get("clientName") ?? "").trim().slice(0, 255);
  let clientCompany = String(formData.get("clientCompany") ?? "").trim().slice(0, 255);
  let clientEmail = String(formData.get("clientEmail") ?? "").trim().slice(0, 255);
  let clientPhone = String(formData.get("clientPhone") ?? "").trim().slice(0, 50);

  if (clientId !== null) {
    const [c] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!c) return { fieldErrors: { clientId: "Контрагент не найден" } };

    // Данные из справочника побеждают: если менеджер выбрал контрагента,
    // писать в КП другое имя он вряд ли хотел
    clientName = c.name;
    clientCompany = c.companyName ?? "";
    clientEmail = c.email ?? clientEmail;
    clientPhone = c.phone ?? clientPhone;
  }

  if (clientName.length < 2) {
    return { fieldErrors: { clientName: "Впишите, кому предложение" } };
  }

  // Позиции приходят списками одинаковой длины - по значению на строку
  const names = formData.getAll("itemName");
  const descriptions = formData.getAll("itemDescription");
  const units = formData.getAll("itemUnit");
  const quantities = formData.getAll("itemQuantity");
  const prices = formData.getAll("itemPrice");

  const items: {
    name: string;
    description: string | null;
    unit: string;
    quantity: number;
    price: string;
    total: string;
    sortOrder: number;
  }[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = String(names[i] ?? "").trim();
    if (name === "") continue;

    const quantity = Number(String(quantities[i] ?? "").trim());
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: `Позиция ${i + 1}: количество - целое число больше нуля` };
    }

    const price = toNumber(prices[i]);
    if (Number.isNaN(price)) return { error: `Позиция ${i + 1}: цена вида 1234.56` };

    items.push({
      name: name.slice(0, 255),
      description: String(descriptions[i] ?? "").trim().slice(0, 2000) || null,
      unit: String(units[i] ?? "").trim().slice(0, 50) || "шт.",
      quantity,
      price: price.toFixed(2),
      total: round2(price * quantity).toFixed(2),
      sortOrder: i,
    });
  }

  if (items.length === 0) {
    return { error: "Добавьте хотя бы одну позицию - иначе предлагать нечего" };
  }

  const discount = toNumber(formData.get("discountPercent"));
  if (Number.isNaN(discount) || discount > 100) {
    return { fieldErrors: { discountPercent: "Скидка от 0 до 100" } };
  }

  const prepayment = toNumber(formData.get("prepaymentPercent"));
  if (Number.isNaN(prepayment) || prepayment > 100) {
    return { fieldErrors: { prepaymentPercent: "Предоплата от 0 до 100" } };
  }

  const subtotal = items.reduce((s, i) => s + Number(i.total), 0);
  const total = round2(subtotal * (1 - discount / 100));

  const validUntil = String(formData.get("validUntil") ?? "").trim();
  const rawDays = String(formData.get("productionDays") ?? "").trim();
  const productionDays = rawDays === "" ? null : Number(rawDays);
  if (productionDays !== null && (!Number.isInteger(productionDays) || productionDays < 0)) {
    return { fieldErrors: { productionDays: "Дни - целое число" } };
  }

  const offerId = await db.transaction(async (tx) => {
    const year = new Date().getFullYear();
    // На колонке номера уникальный индекс: если два КП заведут в одну
    // секунду, второе упадёт на вставке, а не займёт чужой номер
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(commercialOffers)
      .where(sql`${commercialOffers.number} like ${`КП-${year}-%`}`);

    const [created] = await tx
      .insert(commercialOffers)
      .values({
        number: `КП-${year}-${String(n + 1).padStart(3, "0")}`,
        clientId,
        clientName,
        clientCompany: clientCompany || null,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        clientAddress:
          String(formData.get("clientAddress") ?? "").trim().slice(0, 1000) || null,
        validUntil: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? validUntil : null,
        discountPercent: discount.toFixed(2),
        productionDays,
        prepaymentPercent: prepayment.toFixed(2),
        paymentTerms:
          String(formData.get("paymentTerms") ?? "").trim().slice(0, 255) || null,
        notes: String(formData.get("notes") ?? "").trim().slice(0, 5000) || null,
        status: "draft",
        totalAmount: total.toFixed(2),
        createdBy: Number(me.id),
      })
      .returning({ id: commercialOffers.id });

    await tx
      .insert(commercialOfferItems)
      .values(items.map((i) => ({ ...i, offerId: created.id })));

    return created.id;
  });

  await audit("offer.create", { type: "commercial_offer", id: offerId }, {
    clientName,
    total: total.toFixed(2),
  });

  revalidatePath("/admin/offers");
  redirect("/admin/offers");
}

/** Смена состояния КП: отправили, приняли, отказались. */
export async function setOfferStatus(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  if (!(await can("documents", "edit"))) {
    return { error: "Нет прав менять КП" };
  }

  const id = Number(formData.get("offerId"));
  const raw = String(formData.get("status") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { error: "КП не найдено" };
  if (!STATUSES.includes(raw as OfferStatus)) return { error: "Неизвестное состояние" };

  const updated = await db
    .update(commercialOffers)
    .set({ status: raw as OfferStatus })
    .where(eq(commercialOffers.id, id))
    .returning({ id: commercialOffers.id });
  if (updated.length === 0) return { error: "КП не найдено" };

  await audit("offer.status", { type: "commercial_offer", id }, { status: raw });
  revalidatePath("/admin/offers");
  return { ok: true, message: "Состояние сохранено" };
}

/**
 * Завести заказ по принятому предложению.
 *
 * До этого путь «КП принято → заказ» приходилось проходить руками,
 * переписывая позиции заново. Скидка КП уже учтена в итоге, поэтому в
 * заказ уходит именно он, а не сумма позиций.
 */
export async function createOrderFromOffer(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  if (!(await can("orders", "create"))) {
    return { error: "У вашей роли нет права заводить заказы" };
  }

  const offerId = Number(formData.get("offerId"));
  if (!Number.isInteger(offerId) || offerId <= 0) return { error: "КП не найдено" };

  const [offer] = await db
    .select()
    .from(commercialOffers)
    .where(eq(commercialOffers.id, offerId))
    .limit(1);
  if (!offer) return { error: "КП не найдено" };

  const items = await db
    .select()
    .from(commercialOfferItems)
    .where(eq(commercialOfferItems.offerId, offerId))
    .orderBy(asc(commercialOfferItems.sortOrder), asc(commercialOfferItems.id));

  if (items.length === 0) {
    return { error: "В предложении нет позиций - заводить нечего" };
  }

  const subtotal = items.reduce((s, i) => s + Number(i.total), 0);
  const discount = Number(offer.discountPercent ?? 0);
  const total = round2(subtotal * (1 - discount / 100));

  const orderId = await db.transaction(async (tx) => {
    // Контрагента заводим, если КП писали тому, кого ещё нет в
    // справочнике: иначе заказ снова остался бы без заказчика
    let clientId = offer.clientId;
    if (clientId === null) {
      const [created] = await tx
        .insert(clients)
        .values({
          name: offer.clientName,
          companyName: offer.clientCompany,
          email: offer.clientEmail,
          phone: offer.clientPhone,
          address: offer.clientAddress,
        })
        .returning({ id: clients.id });
      clientId = created.id;

      await tx
        .update(commercialOffers)
        .set({ clientId })
        .where(eq(commercialOffers.id, offerId));
    }

    const [order] = await tx
      .insert(externalOrders)
      .values({
        clientId,
        clientName: offer.clientName,
        email: offer.clientEmail,
        phone: offer.clientPhone,
        address: offer.clientAddress,
        description: `По коммерческому предложению ${offer.number}`,
        status: "unpaid",
        totalPrice: total.toFixed(2),
      })
      .returning({ id: externalOrders.id });

    await tx.insert(externalOrderItems).values(
      items.map((i) => ({
        externalOrderId: order.id,
        isCustom: true,
        itemName: i.name,
        itemDescription: i.description,
        quantity: i.quantity,
        // В заказе price - сумма строки целиком, как и в КП
        price: i.total,
      })),
    );

    await tx
      .update(commercialOffers)
      .set({ status: "accepted" })
      .where(eq(commercialOffers.id, offerId));

    await createAccountingForExternalOrder(tx, {
      id: order.id,
      clientName: offer.clientName,
      income: total.toFixed(2),
      status: "unpaid",
    });

    return order.id;
  });

  await audit("offer.to_order", { type: "commercial_offer", id: offerId }, { orderId });

  revalidatePath("/admin/offers");
  revalidatePath("/admin/external-orders");
  redirect(`/admin/external-orders/${orderId}`);
}
