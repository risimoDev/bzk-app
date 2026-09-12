import { eq, sql } from "drizzle-orm";
import { materials, materialsStock, materialsMovements, stockAlerts } from "@/db/schema";

type Tx = Parameters<Parameters<typeof import("@/db").db.transaction>[0]>[0];

export type MovementInput = {
  materialId: number;
  type: "in" | "out";
  /** Количество строкой: numeric в Postgres точный */
  quantity: string;
  referenceType: "order" | "manual";
  referenceId?: number | null;
  comment?: string | null;
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
  const { materialId, type, quantity, referenceType, referenceId, comment } = input;
  const amount = Number(quantity);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Количество должно быть больше нуля");
  }

  const [material] = await tx
    .select({
      name: materials.name,
      unit: materials.unit,
      minStock: materials.minStock,
    })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);

  if (!material) throw new Error("Материал не найден");

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
    throw new Error(
      `Нельзя списать ${amount} ${material.unit}: на складе ${have}`,
    );
  }

  await tx
    .update(materialsStock)
    .set({ quantity: next.toFixed(2) })
    .where(eq(materialsStock.materialId, materialId));

  await tx.insert(materialsMovements).values({
    materialId,
    type,
    quantity,
    referenceType,
    referenceId: referenceId ?? null,
    comment: comment ?? null,
  });

  const min = Number(material.minStock ?? 0);

  if (min > 0 && next < min) {
    const [open] = await tx
      .select({ id: stockAlerts.id })
      .from(stockAlerts)
      .where(
        sql`${stockAlerts.materialId} = ${materialId} AND ${stockAlerts.isResolved} = false`,
      )
      .limit(1);

    if (!open) {
      await tx.insert(stockAlerts).values({
        materialId,
        alertType: next <= 0 ? "out_of_stock" : "low_stock",
        message: `${material.name}: остаток ${next.toFixed(2)} ${material.unit} при минимуме ${min}`,
      });
    }
  }

  if (min > 0 && next >= min) {
    await tx
      .update(stockAlerts)
      .set({ isResolved: true, resolvedAt: new Date() })
      .where(
        sql`${stockAlerts.materialId} = ${materialId} AND ${stockAlerts.isResolved} = false`,
      );
  }

  return { previous: have, current: next };
}
