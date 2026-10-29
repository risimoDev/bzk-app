"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { productAttributes, attributeValues } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { rejectOverlong } from "@/lib/text-limits";

/**
 * Характеристики товара и их значения с надбавками.
 *
 * До этого их правили только в базе, и у 27 из 31 товара витрины
 * характеристик не было вовсе: заводить их было негде.
 *
 * Надбавка прибавляется к цене за единицу, минус - скидка. Считают её
 * корзина и карточка товара одной формулой (`lib/product-price.ts`).
 */

export type AttributeState = { ok?: boolean; message?: string; error?: string };

const DENIED: AttributeState = { error: "У вашей роли нет права менять товары" };

/** Надбавка: деньги строкой, со знаком. Пусто - ноль. */
const MODIFIER = /^-?\d{1,8}([.,]\d{1,2})?$/;

function revalidateProduct(productId: number) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/catalog/${productId}`);
}

function idOf(formData: FormData, name: string) {
  const n = Number(String(formData.get(name) ?? ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Заводит или переименовывает характеристику. */
export async function saveAttribute(
  _prev: AttributeState,
  formData: FormData,
): Promise<AttributeState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  if (!(await can("products", "edit"))) return DENIED;

  const productId = idOf(formData, "productId");
  if (!productId) return { error: "Товар не найден" };

  const id = idOf(formData, "id");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Назовите характеристику: «Бумага», «Ламинация»" };
  if (name.length > 255) return { error: "Слишком длинное название" };

  try {
    if (id) {
      await db
        .update(productAttributes)
        .set({ name })
        .where(and(eq(productAttributes.id, id), eq(productAttributes.productId, productId)));
    } else {
      await db.insert(productAttributes).values({ productId, name, type: "radio" });
    }
  } catch {
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  await audit("product.attribute.save", { type: "product", id: productId }, { name, attributeId: id });
  revalidateProduct(productId);

  return { ok: true, message: id ? "Сохранено" : "Характеристика добавлена" };
}

/** Удаляет характеристику вместе со значениями - их держит каскад в базе. */
export async function deleteAttribute(
  _prev: AttributeState,
  formData: FormData,
): Promise<AttributeState> {
  if (!(await can("products", "edit"))) return DENIED;

  const productId = idOf(formData, "productId");
  const id = idOf(formData, "id");
  if (!productId || !id) return { error: "Характеристика не найдена" };

  await db
    .delete(productAttributes)
    .where(and(eq(productAttributes.id, id), eq(productAttributes.productId, productId)));

  await audit("product.attribute.delete", { type: "product", id: productId }, { attributeId: id });
  revalidateProduct(productId);

  return { ok: true };
}

/** Заводит или меняет значение характеристики. */
export async function saveAttributeValue(
  _prev: AttributeState,
  formData: FormData,
): Promise<AttributeState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  if (!(await can("products", "edit"))) return DENIED;

  const productId = idOf(formData, "productId");
  const attributeId = idOf(formData, "attributeId");
  if (!productId || !attributeId) return { error: "Характеристика не найдена" };

  // Значение привязано к характеристике, а она - к товару. Проверяем
  // цепочку целиком: id из формы подделывается легко, и без проверки
  // можно было бы дописать значение к чужому товару
  const [attr] = await db
    .select({ id: productAttributes.id })
    .from(productAttributes)
    .where(and(eq(productAttributes.id, attributeId), eq(productAttributes.productId, productId)))
    .limit(1);
  if (!attr) return { error: "Характеристика не найдена" };

  const id = idOf(formData, "id");
  const value = String(formData.get("value") ?? "").trim();
  const rawModifier = String(formData.get("priceModifier") ?? "").trim() || "0";

  if (value === "") return { error: "Впишите значение" };
  if (value.length > 255) return { error: "Слишком длинное значение" };
  if (!MODIFIER.test(rawModifier)) return { error: "Надбавка - число вида 1.50 или -0.20" };
  const priceModifier = rawModifier.replace(",", ".");

  try {
    if (id) {
      await db
        .update(attributeValues)
        .set({ value, priceModifier })
        .where(and(eq(attributeValues.id, id), eq(attributeValues.attributeId, attributeId)));
    } else {
      await db.insert(attributeValues).values({ attributeId, value, priceModifier });
    }
  } catch {
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  await audit("product.attribute.value.save", { type: "product", id: productId }, {
    attributeId,
    value,
    priceModifier,
  });
  revalidateProduct(productId);

  return { ok: true, message: id ? "Сохранено" : "Значение добавлено" };
}

export async function deleteAttributeValue(
  _prev: AttributeState,
  formData: FormData,
): Promise<AttributeState> {
  if (!(await can("products", "edit"))) return DENIED;

  const productId = idOf(formData, "productId");
  const attributeId = idOf(formData, "attributeId");
  const id = idOf(formData, "id");
  if (!productId || !attributeId || !id) return { error: "Значение не найдено" };

  const [attr] = await db
    .select({ id: productAttributes.id })
    .from(productAttributes)
    .where(and(eq(productAttributes.id, attributeId), eq(productAttributes.productId, productId)))
    .limit(1);
  if (!attr) return { error: "Значение не найдено" };

  await db
    .delete(attributeValues)
    .where(and(eq(attributeValues.id, id), eq(attributeValues.attributeId, attributeId)));

  await audit("product.attribute.value.delete", { type: "product", id: productId }, {
    attributeId,
    valueId: id,
  });
  revalidateProduct(productId);

  return { ok: true };
}
