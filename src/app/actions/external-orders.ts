"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  externalOrderItems,
  externalOrders,
  externalOrderReadyHistory,
  ordersAccounting,
  products,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import {
  createAccountingForExternalOrder,
  syncAccountingForExternalOrder,
} from "@/lib/accounting-db";
import { notifyStaff } from "@/lib/notify";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import {
  EXTERNAL_PAYMENT_STATUS,
  EXTERNAL_PRODUCTION_STATUS,
  type ExternalPaymentStatus,
  type ExternalProductionStatus,
} from "@/lib/external-orders";

export type ExternalState = { ok: boolean; message?: string };

const DENIED: ExternalState = { ok: false, message: "Нет прав на изменение заказов" };

export async function setPaymentStatus(
  _prev: ExternalState,
  formData: FormData,
): Promise<ExternalState> {
  if (!(await can("orders", "edit"))) return DENIED;

  const orderId = Number(formData.get("orderId"));
  const raw = String(formData.get("status") ?? "");

  if (!Number.isInteger(orderId)) return { ok: false, message: "Заказ не найден" };
  if (!(raw in EXTERNAL_PAYMENT_STATUS)) return { ok: false, message: "Неизвестный статус" };

  const updated = await db
    .update(externalOrders)
    .set({ status: raw as ExternalPaymentStatus })
    .where(eq(externalOrders.id, orderId))
    .returning({ id: externalOrders.id });

  if (updated.length === 0) return { ok: false, message: "Заказ не найден" };

  revalidatePath("/admin/external-orders");
  revalidatePath(`/admin/external-orders/${orderId}`);
  return {
    ok: true,
    message: `Оплата: ${EXTERNAL_PAYMENT_STATUS[raw as ExternalPaymentStatus].label.toLowerCase()}`,
  };
}

export async function setProductionStatus(
  _prev: ExternalState,
  formData: FormData,
): Promise<ExternalState> {
  if (!(await can("orders", "edit"))) return DENIED;

  const orderId = Number(formData.get("orderId"));
  const raw = String(formData.get("productionStatus") ?? "");

  if (!Number.isInteger(orderId)) return { ok: false, message: "Заказ не найден" };
  if (!(raw in EXTERNAL_PRODUCTION_STATUS)) {
    return { ok: false, message: "Неизвестный статус" };
  }

  const updated = await db
    .update(externalOrders)
    .set({ productionStatus: raw as ExternalProductionStatus })
    .where(eq(externalOrders.id, orderId))
    .returning({ id: externalOrders.id });

  if (updated.length === 0) return { ok: false, message: "Заказ не найден" };

  revalidatePath("/admin/external-orders");
  revalidatePath(`/admin/external-orders/${orderId}`);
  return {
    ok: true,
    message: `Производство: ${EXTERNAL_PRODUCTION_STATUS[raw as ExternalProductionStatus].label.toLowerCase()}`,
  };
}

/**
 * Смена срока готовности.
 *
 * Каждое изменение уходит в историю: когда срок двигают второй и третий
 * раз, клиенту нужно уметь показать, когда и почему это случилось.
 */
export async function setReadyDate(
  _prev: ExternalState,
  formData: FormData,
): Promise<ExternalState> {
  const user = await currentUser();
  if (!user || !(await can("orders", "edit"))) return DENIED;

  const orderId = Number(formData.get("orderId"));
  const raw = String(formData.get("readyDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isInteger(orderId)) return { ok: false, message: "Заказ не найден" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, message: "Укажите дату" };
  }

  const [order] = await db
    .select({
      id: externalOrders.id,
      current: externalOrders.estimatedReadyDate,
    })
    .from(externalOrders)
    .where(eq(externalOrders.id, orderId))
    .limit(1);

  if (!order) return { ok: false, message: "Заказ не найден" };

  // Колонка хранит момент времени, а срок - календарный день. Берём
  // полдень по местному: так дата не съедет ни в одну сторону при любом
  // пересчёте часового пояса
  const newDate = new Date(`${raw}T12:00:00`);

  const previous = order.current;
  const changeType = !previous
    ? "set"
    : newDate.getTime() > previous.getTime()
      ? "prolong"
      : "edit";

  // Продление без объяснения - то, за что потом никто не может ответить
  if (changeType === "prolong" && reason === "") {
    return { ok: false, message: "Срок сдвигается вперёд - напишите причину" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(externalOrders)
      .set({ estimatedReadyDate: newDate })
      .where(eq(externalOrders.id, orderId));

    await tx.insert(externalOrderReadyHistory).values({
      externalOrderId: orderId,
      previousDate: previous,
      newDate,
      changeType,
      reason: reason || null,
      changedBy: Number(user.id),
    });
  });

  revalidatePath("/admin/external-orders");
  revalidatePath(`/admin/external-orders/${orderId}`);
  return { ok: true, message: "Срок сохранён" };
}

// ------------------------------------------- заведение и правка заказа

export type OrderFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const EDIT_DENIED: OrderFormState = { error: "Нет прав на изменение заказов" };

/** Сумма из формы: «1 200,50» и «1200.5» - одно и то же число. */
function parseMoney(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (text === "") return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type ParsedItem = {
  productId: number | null;
  isCustom: boolean;
  itemName: string | null;
  itemDescription: string | null;
  quantity: number;
  price: string;
  expenseAmount: string;
  isOutsourced: boolean;
  supplierId: number | null;
};

/**
 * Позиции приходят несколькими списками одинаковой длины - по одному
 * значению на строку. Флажок «перезаказ» пришлось сделать скрытым полем
 * с 0/1: невыставленный чекбокс не приходит вовсе и сдвинул бы все
 * остальные списки на строку.
 *
 * Цена и себестоимость в форме - за единицу, а в базе колонка price
 * хранит сумму строки целиком. Умножаем здесь, чтобы это происходило в
 * одном месте.
 */
function parseItems(formData: FormData): { items: ParsedItem[]; error?: string } {
  const productIds = formData.getAll("itemProductId");
  const names = formData.getAll("itemName");
  const descriptions = formData.getAll("itemDescription");
  const quantities = formData.getAll("itemQuantity");
  const unitPrices = formData.getAll("itemUnitPrice");
  const unitExpenses = formData.getAll("itemUnitExpense");
  const outsourced = formData.getAll("itemOutsourced");
  const suppliers = formData.getAll("itemSupplierId");

  const items: ParsedItem[] = [];

  for (let i = 0; i < productIds.length; i++) {
    const rawProduct = String(productIds[i] ?? "").trim();
    const name = String(names[i] ?? "").trim();
    const quantity = Number(String(quantities[i] ?? "").trim());

    // Пустая строка - это просто незаполненный бланк, а не ошибка
    if (rawProduct === "" && name === "") continue;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { items: [], error: `Позиция ${i + 1}: количество - целое число больше нуля` };
    }

    const unitPrice = parseMoney(unitPrices[i]);
    const unitExpense = parseMoney(unitExpenses[i]);
    if (Number.isNaN(unitPrice) || Number.isNaN(unitExpense)) {
      return { items: [], error: `Позиция ${i + 1}: цена вида 1234.56` };
    }

    const productId = rawProduct === "" ? null : Number(rawProduct);
    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
      return { items: [], error: `Позиция ${i + 1}: товар не найден` };
    }

    const rawSupplier = String(suppliers[i] ?? "").trim();
    const supplierId = rawSupplier === "" ? null : Number(rawSupplier);
    if (supplierId !== null && (!Number.isInteger(supplierId) || supplierId <= 0)) {
      return { items: [], error: `Позиция ${i + 1}: подрядчик не найден` };
    }

    const isOutsourced = String(outsourced[i] ?? "0") === "1";
    if (isOutsourced && supplierId === null) {
      return { items: [], error: `Позиция ${i + 1}: перезаказ - выберите подрядчика` };
    }

    items.push({
      productId,
      isCustom: productId === null,
      itemName: productId === null ? name.slice(0, 255) : null,
      itemDescription: String(descriptions[i] ?? "").trim().slice(0, 2000) || null,
      quantity,
      price: round2(unitPrice * quantity).toFixed(2),
      expenseAmount: round2(unitExpense * quantity).toFixed(2),
      isOutsourced,
      supplierId: isOutsourced ? supplierId : null,
    });
  }

  return { items };
}

/** Товары, которых нет в каталоге, в заказ попасть не должны. */
async function assertProductsExist(items: ParsedItem[]) {
  const ids = [...new Set(items.map((i) => i.productId).filter((v) => v !== null))];
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, ids));
  return rows.length === ids.length;
}

/**
 * Новый заказ менеджера.
 *
 * Заказчик берётся из справочника контрагентов или заводится тут же:
 * ради этого справочник и появился - в следующий раз этот же человек
 * выберется из списка, а не впишется заново.
 *
 * Всё пишется одной транзакцией вместе с бухгалтерской карточкой:
 * заказ без карточки не виден ни в бухгалтерии, ни в аналитике.
 */
export async function createExternalOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const user = await currentUser();
  if (!user || !(await can("orders", "create"))) {
    return { error: "Нет прав на заведение заказов" };
  }

  const mode = String(formData.get("clientMode") ?? "existing");
  const rawClientId = String(formData.get("clientId") ?? "").trim();
  const name = String(formData.get("clientName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 50);
  const email = String(formData.get("email") ?? "").trim().slice(0, 255);
  const address = String(formData.get("address") ?? "").trim().slice(0, 1000);
  const description = String(formData.get("description") ?? "").trim().slice(0, 5000);
  const readyDate = String(formData.get("readyDate") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "unpaid");

  const status = rawStatus in EXTERNAL_PAYMENT_STATUS
    ? (rawStatus as ExternalPaymentStatus)
    : "unpaid";

  const { items, error } = parseItems(formData);
  if (error) return { error };
  if (items.length === 0) {
    return { error: "Добавьте хотя бы одну позицию - иначе непонятно, что заказали" };
  }
  if (!(await assertProductsExist(items))) return { error: "Товар из позиции не найден" };

  const itemsSum = round2(items.reduce((s, i) => s + Number(i.price), 0));
  const rawTotal = String(formData.get("totalPrice") ?? "").trim();
  const total = rawTotal === "" ? itemsSum : parseMoney(rawTotal);
  if (Number.isNaN(total)) return { fieldErrors: { totalPrice: "Сумма вида 1234.56" } };

  // Контрагент: либо выбранный, либо заводим нового прямо отсюда
  let clientId: number | null = null;
  let clientName = name;

  if (mode === "existing") {
    const id = Number(rawClientId);
    if (!Number.isInteger(id) || id <= 0) {
      return { fieldErrors: { clientId: "Выберите заказчика или заведите нового" } };
    }
    const [row] = await db
      .select({
        id: clients.id,
        name: clients.name,
        phone: clients.phone,
        email: clients.email,
        address: clients.address,
      })
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    if (!row) return { fieldErrors: { clientId: "Контрагент не найден" } };

    clientId = row.id;
    // Имя в заказе - слепок на момент заказа: контрагент потом может
    // переименоваться, а в старом заказе должно остаться как было
    clientName = row.name;
  } else {
    if (name.length < 2) {
      return { fieldErrors: { clientName: "Впишите, на кого заказ" } };
    }
  }

  const newOrderId = await db.transaction(async (tx) => {
    if (mode !== "existing") {
      const [created] = await tx
        .insert(clients)
        .values({
          name,
          phone: phone || null,
          email: email || null,
          address: address || null,
        })
        .returning({ id: clients.id });
      clientId = created.id;
    }

    const [order] = await tx
      .insert(externalOrders)
      .values({
        clientId,
        clientName,
        phone: phone || null,
        email: email || null,
        address: address || null,
        description: description || null,
        status,
        totalPrice: total.toFixed(2),
        // Полдень по местному: иначе календарный день съезжает при
        // пересчёте часового пояса
        estimatedReadyDate: /^\d{4}-\d{2}-\d{2}$/.test(readyDate)
          ? new Date(`${readyDate}T12:00:00`)
          : null,
      })
      .returning({ id: externalOrders.id });

    await tx
      .insert(externalOrderItems)
      .values(items.map((i) => ({ ...i, externalOrderId: order.id })));

    await createAccountingForExternalOrder(tx, {
      id: order.id,
      clientName,
      income: total.toFixed(2),
      status,
    });

    return order.id;
  });

  await audit(
    "external_order.create",
    { type: "external_order", id: newOrderId },
    { clientId, total: total.toFixed(2), items: items.length },
  );

  await notifyStaff(
    "external_order_created",
    `Заказ менеджера № ${newOrderId}`,
    // Имя заказчика приходит из формы - в текст с parse_mode=HTML его
    // нельзя вставлять как есть
    `<b>Новый заказ менеджера № ${newOrderId}</b>\nЗаказчик: ${esc(clientName)}\nСумма: ${total.toFixed(2)} ₽`,
    [[{ text: "Открыть заказ", url: absoluteUrl(`/admin/external-orders/${newOrderId}`) }]],
  );

  revalidatePath("/admin/external-orders");
  revalidatePath("/admin/finance");
  if (clientId) revalidatePath(`/admin/counterparties/${clientId}`);

  redirect(`/admin/external-orders/${newOrderId}`);
}

/** Правка шапки заказа: заказчик, контакты, описание, итог. */
export async function updateExternalOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  if (!(await can("orders", "edit"))) return EDIT_DENIED;

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "Заказ не найден" };

  const clientName = String(formData.get("clientName") ?? "").trim().slice(0, 255);
  if (clientName.length < 2) {
    return { fieldErrors: { clientName: "Впишите, на кого заказ" } };
  }

  const rawTotal = String(formData.get("totalPrice") ?? "").trim();
  const total = parseMoney(rawTotal);
  if (Number.isNaN(total)) return { fieldErrors: { totalPrice: "Сумма вида 1234.56" } };

  // Срок готовности здесь не трогаем: он меняется отдельной формой,
  // которая пишет историю переносов
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(externalOrders)
      .set({
        clientName,
        phone: String(formData.get("phone") ?? "").trim().slice(0, 50) || null,
        email: String(formData.get("email") ?? "").trim().slice(0, 255) || null,
        address: String(formData.get("address") ?? "").trim().slice(0, 1000) || null,
        description: String(formData.get("description") ?? "").trim().slice(0, 5000) || null,
        totalPrice: total.toFixed(2),
      })
      .where(eq(externalOrders.id, orderId))
      .returning({ id: externalOrders.id });

    if (rows.length > 0) await syncAccountingForExternalOrder(tx, orderId);
    return rows.length;
  });

  if (updated === 0) return { error: "Заказ не найден" };

  await audit("external_order.update", { type: "external_order", id: orderId }, {
    total: total.toFixed(2),
  });

  revalidatePath("/admin/external-orders");
  revalidatePath(`/admin/external-orders/${orderId}`);
  revalidatePath("/admin/finance");
  return { ok: true, message: "Сохранено" };
}

/**
 * Добавить или поправить позицию заказа.
 *
 * Здесь же ставится признак перезаказа: заказ уходит на сторону то
 * целиком, то частью, поэтому подрядчик выбирается на строке.
 */
export async function saveExternalOrderItem(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  if (!(await can("orders", "edit"))) return EDIT_DENIED;

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "Заказ не найден" };

  const rawItemId = String(formData.get("itemId") ?? "").trim();
  const itemId = rawItemId === "" ? null : Number(rawItemId);
  if (itemId !== null && (!Number.isInteger(itemId) || itemId <= 0)) {
    return { error: "Позиция не найдена" };
  }

  const { items, error } = parseItems(formData);
  if (error) return { error };
  const item = items[0];
  if (!item) return { error: "Заполните позицию" };
  if (!(await assertProductsExist(items))) return { error: "Товар из позиции не найден" };

  const done = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: externalOrders.id })
      .from(externalOrders)
      .where(eq(externalOrders.id, orderId))
      .limit(1);
    if (!order) return false;

    if (itemId === null) {
      await tx.insert(externalOrderItems).values({ ...item, externalOrderId: orderId });
    } else {
      const rows = await tx
        .update(externalOrderItems)
        .set(item)
        .where(
          and(
            eq(externalOrderItems.id, itemId),
            // Номер позиции приходит из формы: без проверки заказа можно
            // было бы отредактировать чужую строку
            eq(externalOrderItems.externalOrderId, orderId),
          ),
        )
        .returning({ id: externalOrderItems.id });
      if (rows.length === 0) return false;
    }

    await syncAccountingForExternalOrder(tx, orderId);
    return true;
  });

  if (!done) return { error: "Заказ или позиция не найдены" };

  await audit(
    itemId === null ? "external_order.item_add" : "external_order.item_update",
    { type: "external_order", id: orderId },
    { itemId, price: item.price, outsourced: item.isOutsourced },
  );

  revalidatePath(`/admin/external-orders/${orderId}`);
  revalidatePath("/admin/finance");
  return { ok: true, message: itemId === null ? "Позиция добавлена" : "Позиция сохранена" };
}

export async function deleteExternalOrderItem(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  if (!(await can("orders", "edit"))) return EDIT_DENIED;

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    return { error: "Позиция не найдена" };
  }

  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(externalOrderItems)
      .where(
        and(
          eq(externalOrderItems.id, itemId),
          eq(externalOrderItems.externalOrderId, orderId),
        ),
      )
      .returning({ id: externalOrderItems.id });

    if (rows.length > 0) await syncAccountingForExternalOrder(tx, orderId);
    return rows.length;
  });

  if (removed === 0) return { error: "Позиция не найдена" };

  await audit("external_order.item_delete", { type: "external_order", id: orderId }, { itemId });
  revalidatePath(`/admin/external-orders/${orderId}`);
  revalidatePath("/admin/finance");
  return { ok: true, message: "Позиция удалена" };
}

/**
 * Удаление заказа. Право есть только у администратора: вместе с заказом
 * уходят его позиции, а бухгалтерская карточка остаётся - деньги по нему
 * могли уже пройти.
 */
export async function deleteExternalOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  if (!(await can("orders", "delete"))) {
    return { error: "Удалять заказы может только администратор" };
  }

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "Заказ не найден" };

  const [card] = await db
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.externalOrderId, orderId))
    .limit(1);

  const rows = await db
    .delete(externalOrders)
    .where(eq(externalOrders.id, orderId))
    .returning({ id: externalOrders.id });

  if (rows.length === 0) return { error: "Заказ не найден" };

  await audit("external_order.delete", { type: "external_order", id: orderId }, {
    accountingKept: card?.id ?? null,
  });

  revalidatePath("/admin/external-orders");
  revalidatePath("/admin/finance");
  redirect("/admin/external-orders");
}
