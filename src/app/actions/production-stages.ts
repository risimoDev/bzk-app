"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { productionStages } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * Этапы производства: названия, порядок и нормативное время.
 *
 * Правит только тот, у кого есть права на настройки. Этап - каркас доски
 * производства: переименование видно всем сразу, а выключенный этап
 * пропадает у заказов, которые ещё не начинали.
 *
 * Удаления нет намеренно: по этапу, который уже проходили заказы, в базе
 * лежит история (`production_order_stages` держит его ограничением
 * restrict). Ненужный этап выключают.
 */

export type StageState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveProductionStage(
  _prev: StageState,
  formData: FormData,
): Promise<StageState> {
  if (!(await can("settings", "edit"))) {
    return { error: "Этапы производства меняет администратор" };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) return { error: "Этап не найден" };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const hoursRaw = String(formData.get("defaultDurationHours") ?? "").trim().replace(",", ".") || "0";
  // Пусто - порядок не задан: новый этап встанет в конец цепочки, у
  // существующего порядок не меняется. Раньше пустое поле превращалось в 0,
  // и все новые этапы оказывались «одновременно первыми»
  const orderRaw = String(formData.get("sortOrder") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Назовите этап";
  if (name.length > 255) fieldErrors.name = "Слишком длинное название";
  if (description.length > 1000) fieldErrors.description = "Слишком длинное описание";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(hoursRaw)) fieldErrors.defaultDurationHours = "Часы - число до 999";
  if (orderRaw !== "" && !/^-?\d{1,4}$/.test(orderRaw)) fieldErrors.sortOrder = "Порядок - целое число";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: Object.values(fieldErrors)[0], fieldErrors };
  }

  const values = {
    name,
    description: description || null,
    defaultDurationHours: hoursRaw,
    isActive,
  };

  try {
    if (id) {
      await db
        .update(productionStages)
        .set(orderRaw === "" ? values : { ...values, sortOrder: Number(orderRaw) })
        .where(eq(productionStages.id, id));
    } else {
      // Шаг 10, а не 1: между двумя этапами всегда можно вставить третий,
      // не перенумеровывая остальные
      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${productionStages.sortOrder}), 0) + 10` })
        .from(productionStages);

      await db.insert(productionStages).values({
        ...values,
        sortOrder: orderRaw === "" ? Number(next) : Number(orderRaw),
        // Системное имя нигде в коде не используется, но в схеме оно
        // обязательное и уникальное. Придумывать его человеку незачем
        slug: `stage-${Date.now().toString(36)}`,
      });
    }
  } catch {
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  await audit("production_stage.save", { type: "production_stage", id }, { name, isActive });

  revalidatePath("/admin/settings/catalogs");
  revalidatePath("/admin/production");

  return { ok: true, message: id ? "Сохранено" : "Этап добавлен" };
}
