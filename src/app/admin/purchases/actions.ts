"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { materials, purchaseOrders, purchaseOrderItems, suppliers } from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { nextPurchaseNumber } from "@/lib/numbering-db";
import {
  PurchaseRuleError,
  addPurchasePayment,
  receivePurchaseItem,
  removePurchasePayment,
} from "@/lib/purchases-db";
import { StockError } from "@/lib/stock";
import type { PurchaseStatus } from "@/lib/purchases";

export type ReceiveState = { ok?: string; error?: string };

const receiveSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Количество вида 12.5")
    .transform((v) => v.replace(",", ".")),
});

/**
 * Приёмка позиции закупки на склад.
 *
 * Пополнение остатка идёт через общий applyMovement - тот же путь, что
 * и у ручного прихода. Движение помечается типом «закупка» и ссылкой на
 * неё, поэтому в истории материала видно, откуда он взялся. Цена материала
 * пересчитывается средневзвешенно (см. receivePurchaseItem).
 */
export async function receiveItem(
  _prev: ReceiveState,
  formData: FormData,
): Promise<ReceiveState> {
  if (!(await can("materials", "edit"))) {
    return { error: "У вашей роли нет права принимать материалы" };
  }

  const parsed = receiveSchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  const { itemId, quantity } = parsed.data;

  let result: Awaited<ReturnType<typeof receivePurchaseItem>>;
  try {
    result = await db.transaction((tx) => receivePurchaseItem(tx, { itemId, quantity }));
  } catch (e) {
    if (e instanceof PurchaseRuleError || e instanceof StockError) return { error: e.message };
    throw e;
  }

  await audit("purchase.receive", { type: "purchase_order", id: result.purchaseOrderId }, {
    itemId,
    materialId: result.materialId,
    quantity,
    costBefore: result.oldCost,
    costAfter: result.newCost,
  });

  revalidatePath("/admin/purchases");
  revalidatePath("/admin/materials");
  revalidatePath(`/admin/materials/${result.materialId}`);

  return { ok: "Позиция принята на склад" };
}

/** Смена статуса закупки вручную - отправлена, подтверждена, отменена. */
export async function setPurchaseStatus(formData: FormData) {
  if (!(await can("materials", "edit"))) return;

  const id = Number(formData.get("purchaseOrderId"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(id) || id <= 0) return;

  const allowed: PurchaseStatus[] = [
    "draft",
    "sent",
    "confirmed",
    "in_delivery",
    "cancelled",
  ];
  if (!allowed.includes(status as PurchaseStatus)) return;

  // Уже принятую закупку не откатываем: материалы на складе, и смена
  // статуса создала бы расхождение между закупкой и остатками
  await db
    .update(purchaseOrders)
    .set({ status: status as PurchaseStatus })
    .where(
      and(
        eq(purchaseOrders.id, id),
        sql`${purchaseOrders.status} NOT IN ('received', 'partially_received')`,
      ),
    );

  revalidatePath("/admin/purchases");
}

// --------------------------------------------------- заведение закупки

export type PurchaseFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const decimal = /^\d{1,8}([.,]\d{1,2})?$/;

const toNumber = (raw: FormDataEntryValue | undefined) => {
  const text = String(raw ?? "").trim().replace(/\s/g, "");
  if (!decimal.test(text)) return NaN;
  return Number(text.replace(",", "."));
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Новая закупка у подрядчика.
 *
 * Номер заказа складывается из года и порядкового числа за год:
 * «ЗК-2026-007». Он уникален в базе, и подрядчику проще сослаться на
 * него, чем на внутренний id.
 */
export async function createPurchase(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const me = await currentUser();
  if (!me || !(await can("materials", "create"))) {
    return { error: "У вашей роли нет права заводить закупки" };
  }

  const supplierId = Number(formData.get("supplierId"));
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return { fieldErrors: { supplierId: "Выберите подрядчика" } };
  }

  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) return { fieldErrors: { supplierId: "Подрядчик не найден" } };

  // Позиции приходят списками одинаковой длины - по значению на строку
  const materialIds = formData.getAll("itemMaterialId");
  const quantities = formData.getAll("itemQuantity");
  const prices = formData.getAll("itemUnitPrice");
  const notes = formData.getAll("itemNote");

  const items: {
    materialId: number;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    notes: string | null;
  }[] = [];

  for (let i = 0; i < materialIds.length; i++) {
    const raw = String(materialIds[i] ?? "").trim();
    if (raw === "") continue;

    const materialId = Number(raw);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      return { error: `Позиция ${i + 1}: материал не найден` };
    }

    const quantity = toNumber(quantities[i]);
    if (Number.isNaN(quantity) || quantity <= 0) {
      return { error: `Позиция ${i + 1}: количество вида 12.5, больше нуля` };
    }

    const unitPrice = toNumber(prices[i]);
    if (Number.isNaN(unitPrice)) {
      return { error: `Позиция ${i + 1}: цена вида 1234.56` };
    }

    items.push({
      materialId,
      quantity: quantity.toFixed(2),
      unitPrice: unitPrice.toFixed(2),
      totalPrice: round2(quantity * unitPrice).toFixed(2),
      notes: String(notes[i] ?? "").trim().slice(0, 500) || null,
    });
  }

  if (items.length === 0) {
    return { error: "Добавьте хотя бы один материал - иначе закупать нечего" };
  }

  const known = await db
    .select({ id: materials.id, name: materials.name, isActive: materials.isActive })
    .from(materials)
    .where(inArray(materials.id, [...new Set(items.map((i) => i.materialId))]));
  if (known.length !== new Set(items.map((i) => i.materialId)).size) {
    return { error: "Материал из позиции не найден" };
  }
  // Отключённый материал в форме не предлагается, но номер приходит из
  // формы: сервер сам не принимает то, что выключено
  const disabled = known.find((m) => m.isActive === false);
  if (disabled) {
    return { error: `Материал «${disabled.name}» отключён - закупить его нельзя` };
  }

  const shipping = String(formData.get("shippingCost") ?? "").trim();
  const shippingCost = shipping === "" ? 0 : toNumber(shipping);
  if (Number.isNaN(shippingCost)) {
    return { fieldErrors: { shippingCost: "Сумма вида 1234.56" } };
  }

  const goods = items.reduce((s, i) => s + Number(i.totalPrice), 0);
  const total = round2(goods + shippingCost);

  const expected = String(formData.get("expectedDeliveryDate") ?? "").trim();

  const purchaseId = await db.transaction(async (tx) => {
    // Номер выдаёт атомарный счётчик: две закупки, заведённые в одну
    // секунду, получают разные номера, а не падают на уникальном индексе
    const orderNumber = await nextPurchaseNumber(tx);

    const [created] = await tx
      .insert(purchaseOrders)
      .values({
        orderNumber,
        supplierId,
        status: "draft",
        totalAmount: total.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        expectedDeliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(expected) ? expected : null,
        createdBy: Number(me.id),
        notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
      })
      .returning({ id: purchaseOrders.id });

    await tx
      .insert(purchaseOrderItems)
      .values(items.map((i) => ({ ...i, purchaseOrderId: created.id })));

    return created.id;
  });

  await audit("purchase.create", { type: "purchase_order", id: purchaseId }, {
    supplier: supplier.name,
    total: total.toFixed(2),
    items: items.length,
  });

  revalidatePath("/admin/purchases");
  redirect("/admin/purchases");
}

// ------------------------------------------------------------ оплата закупки

export type PaymentFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

/** Дата оплаты. Пусто - сегодня; выдуманное число вроде 31 февраля - ошибка. */
function paymentDate(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? "").trim();
  if (text === "") return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  // Полдень, чтобы календарный день не съехал при смене часового пояса
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const ok =
    d.getFullYear() === Number(m[1]) &&
    d.getMonth() === Number(m[2]) - 1 &&
    d.getDate() === Number(m[3]);
  return ok ? d : null;
}

/**
 * Отметка об оплате закупки.
 *
 * Оплата - это ещё и расход компании, поэтому нужны оба права: менять
 * закупки (materials.edit) и заводить расходы (finance.create). У
 * менеджера второго нет, и он отметить оплату не может - как и вписать тот
 * же расход в бухгалтерии руками. Права не расширяем: платит и отмечает
 * тот, кто и так ведёт деньги.
 */
export async function markPurchasePaid(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  if (!(await can("materials", "edit")) || !(await can("finance", "create"))) {
    return { error: "Отметить оплату закупки может тот, кто ведёт расходы (бухгалтерия)" };
  }

  const purchaseOrderId = Number(formData.get("purchaseOrderId"));
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return { error: "Закупка не найдена" };
  }

  const amount = toNumber(formData.get("amount") ?? undefined);
  if (Number.isNaN(amount) || amount <= 0) {
    return { fieldErrors: { amount: "Сумма вида 1234.56, больше нуля" } };
  }

  const paidAt = paymentDate(formData.get("paidAt"));
  if (!paidAt) return { fieldErrors: { paidAt: "Такой даты нет" } };

  let result: Awaited<ReturnType<typeof addPurchasePayment>>;
  try {
    result = await db.transaction((tx) => addPurchasePayment(tx, { purchaseOrderId, amount, paidAt }));
  } catch (e) {
    if (e instanceof PurchaseRuleError) return { error: e.message };
    throw e;
  }

  await audit("purchase.payment_add", { type: "purchase_order", id: purchaseOrderId }, {
    amount: amount.toFixed(2),
    expenseId: result.expenseId,
    status: result.status,
  });

  revalidatePath("/admin/purchases");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
  return { ok: true, message: "Оплата отмечена, расход записан в бухгалтерию" };
}

/** Отмена ошибочной оплаты: расход удаляется, статус пересчитывается. */
export async function cancelPurchasePayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  if (!(await can("materials", "edit")) || !(await can("finance", "delete"))) {
    return { error: "Отменять оплату закупки может только администратор" };
  }

  const expenseId = Number(formData.get("expenseId"));
  if (!Number.isInteger(expenseId) || expenseId <= 0) return { error: "Оплата не найдена" };

  let result: Awaited<ReturnType<typeof removePurchasePayment>>;
  try {
    result = await db.transaction((tx) => removePurchasePayment(tx, expenseId));
  } catch (e) {
    if (e instanceof PurchaseRuleError) return { error: e.message };
    throw e;
  }

  await audit("purchase.payment_cancel", { type: "purchase_order", id: result.purchaseOrderId }, {
    expenseId,
    amount: result.amount,
    status: result.status,
  });

  revalidatePath("/admin/purchases");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
  return { ok: true, message: "Оплата отменена" };
}
