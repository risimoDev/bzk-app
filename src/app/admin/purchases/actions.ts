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
import { applyMovement } from "@/lib/stock";
import { RECEIVABLE, type PurchaseStatus } from "@/lib/purchases";
import { localDate } from "@/lib/dates";

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
 * и у ручного прихода. Движение помечается ссылкой на закупку, поэтому
 * в истории материала видно, откуда он взялся.
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
  const amount = Number(quantity);

  try {
    await db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          id: purchaseOrderItems.id,
          purchaseOrderId: purchaseOrderItems.purchaseOrderId,
          materialId: purchaseOrderItems.materialId,
          ordered: purchaseOrderItems.quantity,
          received: purchaseOrderItems.receivedQuantity,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.id, itemId))
        .for("update")
        .limit(1);

      if (!item) throw new Error("Позиция не найдена");

      const [order] = await tx
        .select({ status: purchaseOrders.status, number: purchaseOrders.orderNumber })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, item.purchaseOrderId))
        .limit(1);

      if (!order || !RECEIVABLE.includes((order.status ?? "draft") as PurchaseStatus)) {
        throw new Error("Эту закупку сейчас нельзя принимать");
      }

      const already = Number(item.received ?? 0);
      const ordered = Number(item.ordered);

      // Принять больше заказанного - почти всегда опечатка, и она
      // молча раздувает остаток на складе
      if (already + amount > ordered) {
        throw new Error(
          `Уже принято ${already} из ${ordered}. Больше заказанного принять нельзя`,
        );
      }

      await applyMovement(tx, {
        materialId: item.materialId,
        type: "in",
        quantity,
        referenceType: "order",
        referenceId: item.purchaseOrderId,
        comment: `Приёмка по закупке ${order.number}`,
      });

      await tx
        .update(purchaseOrderItems)
        .set({ receivedQuantity: (already + amount).toFixed(2) })
        .where(eq(purchaseOrderItems.id, itemId));

      // Статус закупки пересчитываем по всем позициям сразу: принята
      // целиком только когда каждая позиция закрыта полностью
      const rest = await tx
        .select({
          ordered: purchaseOrderItems.quantity,
          received: purchaseOrderItems.receivedQuantity,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, item.purchaseOrderId));

      const allDone = rest.every(
        (r) => Number(r.received ?? 0) >= Number(r.ordered),
      );
      const anyDone = rest.some((r) => Number(r.received ?? 0) > 0);

      await tx
        .update(purchaseOrders)
        .set({
          status: allDone ? "received" : anyDone ? "partially_received" : order.status,
          // Календарный день берём в поясе компании, иначе ночная
          // приёмка запишется вчерашним числом
          actualDeliveryDate: allDone ? localDate() : null,
        })
        .where(eq(purchaseOrders.id, item.purchaseOrderId));
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Не удалось принять позицию",
    };
  }

  revalidatePath("/admin/purchases");
  revalidatePath("/admin/materials");

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
    .select({ id: materials.id })
    .from(materials)
    .where(inArray(materials.id, [...new Set(items.map((i) => i.materialId))]));
  if (known.length !== new Set(items.map((i) => i.materialId)).size) {
    return { error: "Материал из позиции не найден" };
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
