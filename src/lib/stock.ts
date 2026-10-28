import { and, eq } from "drizzle-orm";
import { materials, materialsStock, materialsMovements, stockAlerts } from "@/db/schema";

import type { Tx } from "@/lib/order-money-db";

/** Отказ склада по правилу (уход в минус, неверное количество) - текст показывается человеку. */
export class StockError extends Error {}

export type MovementInput = {
  materialId: number;
  type: "in" | "out";
  /** Количество строкой: numeric в Postgres точный */
  quantity: string;
  /**
   * order - заказ менеджера, site_order - заказ с сайта (номера двух
   * таблиц пересекаются, по одному referenceId их не различить),
   * purchase - приёмка закупки.
   */
  referenceType: "order" | "site_order" | "manual" | "purchase";
  referenceId?: number | null;
  comment?: string | null;
  /** Это движение отменяет другое (возврат списания на склад) */
  reversesMovementId?: number | null;
};

/**
 * Единая точка изменения остатка.
 *
 * И ручное движение, и приёмка закупки идут через неё: иначе правила
 * (запрет ухода в минус, оповещения о нехватке) пришлось бы держать
 * в двух местах, и они разошлись бы при первой же правке.
 *
 * Вызывать только внутри транзакции - функция полагается на блокировку
 * строки остатка и на то, что при ошибке откатится всё разом.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  const { materialId, type, quantity, referenceType, referenceId, comment, reversesMovementId } = input;
  const amount = Number(quantity);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new StockError("Количество должно быть больше нуля");
  }

  const [material] = await tx
    .select({
      name: materials.name,
      unit: materials.unit,
    })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);

  if (!material) throw new StockError("Материал не найден");

  // Строки остатка может не быть - материал заводили без прихода
  await tx
    .insert(materialsStock)
    .values({ materialId, quantity: "0" })
    .onConflictDoNothing({ target: materialsStock.materialId });

  // Блокируем строку: без этого два одновременных списания прочитают
  // один и тот же остаток и оба вычтут из него
  const [current] = await tx
    .select({ quantity: materialsStock.quantity })
    .from(materialsStock)
    .where(eq(materialsStock.materialId, materialId))
    .for("update")
    .limit(1);

  const have = Number(current?.quantity ?? 0);
  const next = type === "in" ? have + amount : have - amount;

  if (next < 0) {
    throw new StockError(
      `Нельзя списать ${amount} ${material.unit}: на складе ${have}`,
    );
  }

  await tx
    .update(materialsStock)
    .set({ quantity: next.toFixed(2) })
    .where(eq(materialsStock.materialId, materialId));

  const [movement] = await tx
    .insert(materialsMovements)
    .values({
      materialId,
      type,
      quantity,
      referenceType,
      referenceId: referenceId ?? null,
      comment: comment ?? null,
      reversesMovementId: reversesMovementId ?? null,
    })
    .returning({ id: materialsMovements.id });

  await syncStockAlerts(tx, materialId);

  return { previous: have, current: next, movementId: movement.id };
}

/**
 * Оповещения о нехватке материала приводятся к фактическому остатку.
 *
 * Звать после любого изменения остатка и после правки минимума или
 * активности материала: раньше оповещение пересчитывалось только при
 * движении, и поднятый минимум не вызывал тревоги, а сброшенный не гасил
 * уже открытую. Материал без минимума или выключенный оповещений не
 * даёт - открытые гасятся.
 */
export async function syncStockAlerts(tx: Tx, materialId: number) {
  const [material] = await tx
    .select({
      name: materials.name,
      unit: materials.unit,
      minStock: materials.minStock,
      isActive: materials.isActive,
    })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);
  if (!material) return;

  const [stock] = await tx
    .select({ quantity: materialsStock.quantity })
    .from(materialsStock)
    .where(eq(materialsStock.materialId, materialId))
    .limit(1);

  const have = Number(stock?.quantity ?? 0);
  const min = Number(material.minStock ?? 0);
  const needAlert = material.isActive !== false && min > 0 && have < min;

  const [open] = await tx
    .select({ id: stockAlerts.id })
    .from(stockAlerts)
    .where(and(eq(stockAlerts.materialId, materialId), eq(stockAlerts.isResolved, false)))
    .limit(1);

  if (!needAlert) {
    if (open) {
      await tx
        .update(stockAlerts)
        .set({ isResolved: true, resolvedAt: new Date() })
        .where(and(eq(stockAlerts.materialId, materialId), eq(stockAlerts.isResolved, false)));
    }
    return;
  }

  const values = {
    alertType: have <= 0 ? ("out_of_stock" as const) : ("low_stock" as const),
    message: `${material.name}: остаток ${have.toFixed(2)} ${material.unit} при минимуме ${min}`,
  };

  if (open) {
    // Открытое оповещение освежаем: остаток и минимум могли измениться
    await tx.update(stockAlerts).set(values).where(eq(stockAlerts.id, open.id));
  } else {
    await tx.insert(stockAlerts).values({ materialId, ...values });
  }
}
