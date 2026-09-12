"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  documentCategories,
  expensesCategories,
  productQuantityPrices,
  products,
} from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * Справочники: категории товаров, статьи расходов, разделы документов и
 * цены по тиражам.
 *
 * Все четыре - короткие списки, которые до сих пор правились только
 * прямо в базе. Формы у них одинаковые до неразличимости, поэтому и
 * действия лежат в одном файле.
 */

export type CatalogState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const nameOf = (formData: FormData, max = 255) =>
  String(formData.get("name") ?? "").trim().slice(0, max);

// ------------------------------------------------- категории товаров

export async function saveCategory(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("products", isNew ? "create" : "edit"))) {
    return { error: "Нет прав менять каталог" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Категория не найдена" };
  }

  const name = nameOf(formData);
  if (name.length < 2) return { fieldErrors: { name: "Слишком короткое название" } };

  const [twin] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(sql`lower(${categories.name})`, name.toLowerCase()),
        isNew ? sql`true` : ne(categories.id, id),
      ),
    )
    .limit(1);
  if (twin) return { fieldErrors: { name: "Такая категория уже есть" } };

  if (isNew) {
    const [created] = await db
      .insert(categories)
      .values({ name })
      .returning({ id: categories.id });
    await audit("category.create", { type: "category", id: created.id }, { name });
  } else {
    await db.update(categories).set({ name }).where(eq(categories.id, id));
    await audit("category.update", { type: "category", id }, { name });
  }

  revalidatePath("/admin/settings/catalogs");
  revalidatePath("/catalog");
  return { ok: true, message: "Сохранено" };
}

/**
 * Удаление категории.
 *
 * Товары к ней привязаны через `set null`, так что они не пропадут -
 * просто окажутся без категории. Об этом и предупреждаем.
 */
export async function deleteCategory(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await can("products", "delete"))) {
    return { error: "Удалять категории может только администратор" };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Категория не найдена" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.categoryId, id));

  if (n > 0) {
    return { error: `В категории ${n} товаров - сначала перенесите их` };
  }

  await db.delete(categories).where(eq(categories.id, id));
  await audit("category.delete", { type: "category", id });

  revalidatePath("/admin/settings/catalogs");
  revalidatePath("/catalog");
  return { ok: true, message: "Категория удалена" };
}

// --------------------------------------------------- статьи расходов

export async function saveExpenseCategory(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("finance", isNew ? "create" : "edit"))) {
    return { error: "Нет прав менять бухгалтерию" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) return { error: "Статья не найдена" };

  const name = nameOf(formData);
  if (name.length < 2) return { fieldErrors: { name: "Слишком короткое название" } };
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 1000) || null;

  if (isNew) {
    const [created] = await db
      .insert(expensesCategories)
      .values({ name, description })
      .returning({ id: expensesCategories.id });
    await audit("expense_category.create", { type: "expenses_category", id: created.id }, { name });
  } else {
    await db
      .update(expensesCategories)
      .set({ name, description })
      .where(eq(expensesCategories.id, id));
    await audit("expense_category.update", { type: "expenses_category", id }, { name });
  }

  revalidatePath("/admin/settings/catalogs");
  revalidatePath("/admin/finance");
  return { ok: true, message: "Сохранено" };
}

// ------------------------------------------------- разделы документов

/** Слаг из названия: латиница для адресов, кириллица транслитом. */
function slugify(name: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  return (
    name
      .toLowerCase()
      .split("")
      .map((ch) => map[ch] ?? ch)
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "razdel"
  );
}

export async function saveDocumentCategory(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("documents", isNew ? "create" : "edit"))) {
    return { error: "Нет прав менять документы" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) return { error: "Раздел не найден" };

  const name = nameOf(formData, 100);
  if (name.length < 2) return { fieldErrors: { name: "Слишком короткое название" } };

  const rawOrder = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = rawOrder === "" ? 0 : Number(rawOrder);
  if (!Number.isInteger(sortOrder)) {
    return { fieldErrors: { sortOrder: "Порядок - целое число" } };
  }

  const isActive = formData.get("isActive") === "on";

  if (isNew) {
    // Слаг уникален; если такой уже занят, дописываем номер
    const base = slugify(name);
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const [busy] = await db
        .select({ id: documentCategories.id })
        .from(documentCategories)
        .where(eq(documentCategories.slug, slug))
        .limit(1);
      if (!busy) break;
      slug = `${base}-${i}`.slice(0, 50);
    }

    const [created] = await db
      .insert(documentCategories)
      .values({ name, slug, sortOrder, isActive })
      .returning({ id: documentCategories.id });
    await audit("document_category.create", { type: "document_category", id: created.id }, { name });
  } else {
    await db
      .update(documentCategories)
      .set({ name, sortOrder, isActive })
      .where(eq(documentCategories.id, id));
    await audit("document_category.update", { type: "document_category", id }, { name });
  }

  revalidatePath("/admin/settings/catalogs");
  revalidatePath("/admin/documents");
  return { ok: true, message: "Сохранено" };
}

// ---------------------------------------------------- цены по тиражам

/**
 * Ступень цены: от какого тиража и по какой цене за единицу.
 *
 * Верхнюю границу можно не указывать - это последняя ступень, «и
 * дальше». Пересечения ступеней не проверяем строго: цену выбирает
 * последняя подходящая, и менеджеру важнее свобода, чем формальность.
 */
export async function savePriceTier(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await can("products", "edit"))) {
    return { error: "Нет прав менять товары" };
  }

  const productId = Number(formData.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Товар не найден" };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Ступень не найдена" };
  }

  const minQty = Number(String(formData.get("minQty") ?? "").trim());
  if (!Number.isInteger(minQty) || minQty <= 0) {
    return { fieldErrors: { minQty: "Тираж - целое число больше нуля" } };
  }

  const rawMax = String(formData.get("maxQty") ?? "").trim();
  const maxQty = rawMax === "" ? null : Number(rawMax);
  if (maxQty !== null && (!Number.isInteger(maxQty) || maxQty < minQty)) {
    return { fieldErrors: { maxQty: "Верхняя граница не меньше нижней" } };
  }

  const rawPrice = String(formData.get("price") ?? "").trim().replace(",", ".");
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    return { fieldErrors: { price: "Цена вида 1234.56" } };
  }

  const values = { productId, minQty, maxQty, price: price.toFixed(2) };

  if (id === null) {
    await db.insert(productQuantityPrices).values(values);
  } else {
    const rows = await db
      .update(productQuantityPrices)
      .set(values)
      .where(
        and(
          eq(productQuantityPrices.id, id),
          // Номер ступени приходит из формы: без привязки к товару можно
          // было бы поправить чужую цену
          eq(productQuantityPrices.productId, productId),
        ),
      )
      .returning({ id: productQuantityPrices.id });
    if (rows.length === 0) return { error: "Ступень не найдена" };
  }

  await audit("product.price_tier", { type: "product", id: productId }, {
    minQty,
    maxQty,
    price: values.price,
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/catalog/${productId}`);
  return { ok: true, message: "Сохранено" };
}

export async function deletePriceTier(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await can("products", "edit"))) {
    return { error: "Нет прав менять товары" };
  }

  const productId = Number(formData.get("productId"));
  const id = Number(formData.get("id"));
  if (!Number.isInteger(productId) || !Number.isInteger(id)) {
    return { error: "Ступень не найдена" };
  }

  const removed = await db
    .delete(productQuantityPrices)
    .where(
      and(
        eq(productQuantityPrices.id, id),
        eq(productQuantityPrices.productId, productId),
      ),
    )
    .returning({ id: productQuantityPrices.id });
  if (removed.length === 0) return { error: "Ступень не найдена" };

  await audit("product.price_tier_delete", { type: "product", id: productId }, { id });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/catalog/${productId}`);
  return { ok: true, message: "Ступень удалена" };
}
