"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { materials, materialsStock } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { StockError, applyMovement, syncStockAlerts } from "@/lib/stock";
import { MoneyRuleError, type OrderRef } from "@/lib/order-money-db";
import { returnWriteOff, writeOffToOrder, type WriteOffSource } from "@/lib/write-off-db";
import { rejectOverlong } from "@/lib/text-limits";

export type MovementState = {
  ok?: string;
  error?: string;
};

const schema = z.object({
  materialId: z.coerce.number().int().positive(),
  type: z.enum(["in", "out"]),
  // Количество строкой: numeric в Postgres точный, и лишний проход
  // через число теряет дробную часть на длинных значениях
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Количество вида 12.5")
    .transform((v) => v.replace(",", ".")),
  comment: z.string().trim().max(500).optional(),
});

/**
 * Ручной приход или расход материала.
 *
 * Вся работа с остатком - в applyMovement: там же живут запрет ухода
 * в минус и оповещения о нехватке, общие с приёмкой закупок.
 */
export async function recordMovement(
  _prev: MovementState,
  formData: FormData,
): Promise<MovementState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return { error: tooLong.error };

  if (!(await can("materials", "edit"))) {
    return { error: "У вашей роли нет права менять склад" };
  }

  const parsed = schema.safeParse({
    materialId: formData.get("materialId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  const { materialId, type, quantity, comment } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await applyMovement(tx, {
        materialId,
        type,
        quantity,
        referenceType: "manual",
        comment,
      });
    });
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");

  return { ok: type === "in" ? "Приход записан" : "Расход записан" };
}

// ------------------------------------------------- карточка материала

export type MaterialState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Числа склада хранятся в numeric и проверяются строкой: превращать их
 * в число ради проверки - верный способ потерять дробную часть.
 */
const decimal = (label: string) =>
  z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\d{1,8}([.,]\d{1,4})?$/, `${label} вида 12.5`)
        .transform((v) => v.replace(",", ".")),
    ])
    .optional();

const materialSchema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название").max(255),
  unit: z.string().trim().min(1, "Укажите единицу измерения").max(50),
  costPerUnit: decimal("Цена"),
  minStock: decimal("Минимум"),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["paper", "vinyl", "banner", "film", "ink", "lamination", "other"]),
  materialType: z.enum(["sheet", "roll", "piece", "liquid"]),
  supplier: z.string().trim().max(255).optional(),
  widthMm: decimal("Ширина"),
  heightMm: decimal("Высота"),
  isActive: z.coerce.boolean(),
});

/**
 * Заводит материал или правит существующий.
 *
 * Вместе с новым материалом создаётся строка остатка: без неё склад
 * показывал бы прочерк вместо нуля, а движения падали бы на попытке
 * обновить несуществующую запись.
 */
export async function saveMaterial(
  _prev: MaterialState,
  formData: FormData,
): Promise<MaterialState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("materials", isNew ? "create" : "edit"))) {
    return { error: "У вашей роли нет права менять склад" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) return { error: "Материал не найден" };

  const parsed = materialSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    costPerUnit: formData.get("costPerUnit"),
    minStock: formData.get("minStock"),
    description: formData.get("description"),
    category: formData.get("category") || "other",
    materialType: formData.get("materialType") || "sheet",
    supplier: formData.get("supplier"),
    widthMm: formData.get("widthMm"),
    heightMm: formData.get("heightMm"),
    isActive: formData.get("isActive") === "on",
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
  const values = {
    name: v.name,
    unit: v.unit,
    costPerUnit: v.costPerUnit || null,
    minStock: v.minStock || "0.00",
    description: v.description || null,
    category: v.category,
    materialType: v.materialType,
    supplier: v.supplier || null,
    widthMm: v.widthMm || null,
    heightMm: v.heightMm || null,
    isActive: v.isActive,
  };

  if (isNew) {
    const materialId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(materials)
        .values(values)
        .returning({ id: materials.id });

      await tx.insert(materialsStock).values({ materialId: created.id, quantity: "0.00" });
      return created.id;
    });

    await audit("material.create", { type: "material", id: materialId }, { name: v.name });
    revalidatePath("/admin/materials");
    redirect(`/admin/materials/${materialId}`);
  }

  // Правка и пересчёт оповещений - одной транзакцией. Поднятый минимум
  // должен сразу показать нехватку, а снятый или выключенный материал -
  // погасить уже открытое оповещение: раньше оповещения пересчитывались
  // только при движении склада
  const updated = await db.transaction(async (tx) => {
    // Остаток блокируем первым: так же идут приёмка и списание (остаток →
    // материал → оповещения). В другом порядке правка карточки и приёмка
    // ждали бы друг друга по кругу и могли завести два оповещения
    const [exists] = await tx.select({ id: materials.id }).from(materials).where(eq(materials.id, id)).limit(1);
    if (!exists) return [];

    await tx
      .insert(materialsStock)
      .values({ materialId: id, quantity: "0.00" })
      .onConflictDoNothing({ target: materialsStock.materialId });
    await tx
      .select({ id: materialsStock.id })
      .from(materialsStock)
      .where(eq(materialsStock.materialId, id))
      .for("update");

    const rows = await tx
      .update(materials)
      .set(values)
      .where(eq(materials.id, id))
      .returning({ id: materials.id });
    if (rows.length > 0) await syncStockAlerts(tx, id);
    return rows;
  });
  if (updated.length === 0) return { error: "Материал не найден" };

  await audit("material.update", { type: "material", id }, { name: v.name });
  revalidatePath("/admin/materials");
  revalidatePath(`/admin/materials/${id}`);
  return { ok: true, message: "Сохранено" };
}

// ------------------------------------------- списание материалов на заказ

export type WriteOffState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

/** Заказ из формы: источник и номер. Источник - только из двух значений. */
function orderRefFrom(formData: FormData): OrderRef | null {
  const raw = String(formData.get("source") ?? "external");
  if (raw !== "site" && raw !== "external") return null;
  const id = Number(formData.get("orderId") ?? formData.get("externalOrderId"));
  if (!Number.isInteger(id) || id <= 0) return null;
  return { source: raw as WriteOffSource, id };
}

/** Страницы, где видно списание: заказ, склад, бухгалтерия. */
function revalidateWriteOff(ref: OrderRef, materialId: number) {
  revalidatePath(
    ref.source === "site" ? `/admin/orders/${ref.id}` : `/admin/external-orders/${ref.id}`,
  );
  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
}

/**
 * Списать материал со склада на заказ - менеджера или с сайта.
 *
 * До этого расход материалов ни к какому заказу не привязывался, и
 * себестоимость по факту собрать было нельзя: в карточке заказа стоял
 * только расчёт по рецептуре товара. Здесь движение уходит на склад, а
 * его стоимость - отдельной строкой расхода в бухгалтерию заказа
 * (см. writeOffToOrder).
 */
export async function writeOffMaterial(
  _prev: WriteOffState,
  formData: FormData,
): Promise<WriteOffState> {
  if (!(await can("materials", "edit"))) {
    return { ok: false, error: "У вашей роли нет права менять склад" };
  }

  const ref = orderRefFrom(formData);
  if (!ref) return { ok: false, error: "Заказ не найден" };

  const materialId = Number(formData.get("materialId"));
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return { ok: false, error: "Выберите материал" };
  }

  const raw = String(formData.get("quantity") ?? "").trim().replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    return { ok: false, error: "Количество вида 12.5, больше нуля" };
  }

  let result: Awaited<ReturnType<typeof writeOffToOrder>>;
  try {
    result = await db.transaction((tx) => writeOffToOrder(tx, ref, { materialId, quantity: raw }));
  } catch (e) {
    if (e instanceof MoneyRuleError || e instanceof StockError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await audit(
    "material.write_off",
    { type: ref.source === "site" ? "order" : "external_order", id: ref.id },
    { materialId, quantity: raw, cost: result.cost.toFixed(2) },
  );

  revalidateWriteOff(ref, materialId);

  return {
    ok: true,
    message: `Списано ${result.amount} ${result.material.unit} - ${result.cost.toFixed(2)} ₽ в расходы заказа`,
  };
}

/**
 * Вернуть списание на склад: приход, снятие строки расхода и пересчёт
 * денег заказа - одной транзакцией. Права те же, что у самого списания.
 */
export async function returnWriteOffToStock(
  _prev: WriteOffState,
  formData: FormData,
): Promise<WriteOffState> {
  if (!(await can("materials", "edit"))) {
    return { ok: false, error: "У вашей роли нет права менять склад" };
  }

  const ref = orderRefFrom(formData);
  if (!ref) return { ok: false, error: "Заказ не найден" };

  const movementId = Number(formData.get("movementId"));
  if (!Number.isInteger(movementId) || movementId <= 0) {
    return { ok: false, error: "Списание не найдено" };
  }

  let result: Awaited<ReturnType<typeof returnWriteOff>>;
  try {
    result = await db.transaction((tx) => returnWriteOff(tx, ref, movementId));
  } catch (e) {
    if (e instanceof MoneyRuleError || e instanceof StockError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await audit(
    "material.write_off_return",
    { type: ref.source === "site" ? "order" : "external_order", id: ref.id },
    { movementId, materialId: result.materialId, quantity: result.quantity },
  );

  revalidateWriteOff(ref, result.materialId);

  return {
    ok: true,
    message: result.expenseRemoved
      ? "Материал возвращён на склад, расход по заказу снят"
      : "Материал возвращён на склад",
  };
}
