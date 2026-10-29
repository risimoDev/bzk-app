"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { categories, products, productImages } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { saveProductImage, removeUpload } from "@/lib/uploads";
import {
  isProductImageKind,
  productImageUrl,
  productImageFilename,
  MAX_PRODUCT_BATCH_SIZE,
  type ProductImageKind,
} from "@/lib/product-images";
import { rejectOverlong } from "@/lib/text-limits";

export type ProductState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Цена приходит строкой: numeric в Postgres хранится точно, и превращать
 * её в число ради валидации - верный способ потерять копейки на длинных
 * дробях. Проверяем формат, а в базу отдаём как есть.
 */
const priceString = z
  .string()
  .trim()
  .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Цена вида 1234.56")
  .transform((v) => v.replace(",", "."));

const schema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название").max(255),
  description: z.string().trim().max(5000).optional(),
  basePrice: priceString,
  unit: z.string().trim().max(50).optional(),
  minQuantity: z.coerce.number().int().min(1, "Минимум 1"),
  multiplicity: z.coerce.number().int().min(1, "Минимум 1"),
  isHidden: z.coerce.boolean(),
  isPopular: z.coerce.boolean(),
  categoryId: z
    .union([z.literal(""), z.string().regex(/^\d+$/, "Категория не найдена")])
    .optional(),
});

/**
 * Сохранение товара: без `id` заводится новый.
 *
 * Одно действие на оба случая - поля совпадают целиком, и разводить их
 * значило бы поддерживать две одинаковые проверки.
 */
export async function saveProduct(
  _prev: ProductState,
  formData: FormData,
): Promise<ProductState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("products", isNew ? "create" : "edit"))) {
    return {
      error: isNew
        ? "У вашей роли нет права заводить товары"
        : "У вашей роли нет права менять товары",
    };
  }

  if (!isNew && (!Number.isInteger(id) || id <= 0)) return { error: "Товар не найден" };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    basePrice: formData.get("basePrice"),
    unit: formData.get("unit"),
    minQuantity: formData.get("minQuantity"),
    multiplicity: formData.get("multiplicity"),
    // Невыставленный чекбокс не приходит в FormData вовсе
    isHidden: formData.get("isHidden") === "on",
    isPopular: formData.get("isPopular") === "on",
    categoryId: formData.get("categoryId"),
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

  const categoryId = v.categoryId ? Number(v.categoryId) : null;
  if (categoryId !== null) {
    const [exists] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!exists) return { fieldErrors: { categoryId: "Категория не найдена" } };
  }

  const values = {
    name: v.name,
    description: v.description || null,
    basePrice: v.basePrice,
    unit: v.unit || "шт.",
    minQuantity: v.minQuantity,
    multiplicity: v.multiplicity,
    isHidden: v.isHidden,
    isPopular: v.isPopular,
    categoryId,
  };

  let createdId: number | null = null;

  try {
    if (isNew) {
      const [created] = await db
        .insert(products)
        .values(values)
        .returning({ id: products.id });
      createdId = created.id;
    } else {
      await db.update(products).set(values).where(eq(products.id, id));
    }
  } catch {
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  const productId = createdId ?? id;
  await audit(isNew ? "product.create" : "product.update", {
    type: "product",
    id: productId,
  }, { name: v.name, basePrice: v.basePrice });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath(`/catalog/${productId}`);
  revalidatePath("/catalog");

  if (createdId !== null) redirect(`/admin/products/${createdId}`);

  return { ok: true };
}

// ------------------------------------------------------------ картинки

export type ImageState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

/** Сброс кеша везде, где картинка товара видна. */
function revalidateProduct(productId: number) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/catalog/${productId}`);
  revalidatePath("/catalog");
  revalidatePath("/favorites");
}

/** За один раз - не больше десяти файлов: остальное подождёт второй загрузки. */
const MAX_FILES_AT_ONCE = 10;

/**
 * Загрузка картинок товара.
 *
 * Логотип у товара один: новый вытесняет прежний вместе с файлом, иначе
 * в хранилище копились бы забытые варианты. Фотографий может быть
 * сколько угодно, и первая из них сама становится главной - иначе
 * карточка осталась бы без большого снимка, пока про кнопку не вспомнят.
 */
export async function uploadProductImage(
  _prev: ImageState,
  formData: FormData,
): Promise<ImageState> {
  if (!(await can("products", "edit"))) {
    return { error: "У вашей роли нет права менять товары" };
  }

  const productId = Number(String(formData.get("productId") ?? ""));
  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Товар не найден" };
  }

  const rawKind = formData.get("kind");
  if (!isProductImageKind(rawKind)) return { error: "Не выбрано, что это за картинка" };
  const kind: ProductImageKind = rawKind;

  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return { error: "Товар не найден" };

  const picked = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (picked.length === 0) return { error: "Выберите файл" };
  if (picked.length > MAX_FILES_AT_ONCE) {
    return { error: `За раз не больше ${MAX_FILES_AT_ONCE} файлов` };
  }

  // Логотип один, и присылать пачку для него незачем
  const files = kind === "logo" ? picked.slice(0, 1) : picked;

  // Тело действия ограничено 10 МБ целиком; дальше Next отвечает общей
  // ошибкой, а так человек получает понятную подсказку
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_PRODUCT_BATCH_SIZE) {
    return { error: "Файлы вместе больше 9 МБ - загрузите их по частям" };
  }

  const saved: string[] = [];
  try {
    for (const file of files) {
      const { filename } = await saveProductImage(file);
      saved.push(filename);
    }
  } catch (e) {
    // Часть файлов могла лечь на диск до отказа - убираем, чтобы не
    // оставлять записи, на которые никто не ссылается
    await Promise.all(saved.map((name) => removeUpload(name, "products")));
    return { error: e instanceof Error ? e.message : "Не удалось загрузить" };
  }

  try {
    if (kind === "logo") {
      const old = await db
        .select({ id: productImages.id, imageUrl: productImages.imageUrl })
        .from(productImages)
        .where(
          and(eq(productImages.productId, productId), eq(productImages.kind, "logo")),
        );

      if (old.length > 0) {
        await db
          .delete(productImages)
          .where(
            and(eq(productImages.productId, productId), eq(productImages.kind, "logo")),
          );
        for (const row of old) {
          const name = productImageFilename(row.imageUrl);
          if (name) await removeUpload(name, "products");
        }
      }

      await db.insert(productImages).values({
        productId,
        imageUrl: productImageUrl(saved[0]),
        // Логотип показывается в каталоге, где выбирается главная картинка
        isMain: true,
        kind: "logo",
      });
    } else {
      const [existingMain] = await db
        .select({ id: productImages.id })
        .from(productImages)
        .where(
          and(
            eq(productImages.productId, productId),
            eq(productImages.kind, "photo"),
            eq(productImages.isMain, true),
          ),
        )
        .limit(1);

      await db.insert(productImages).values(
        saved.map((name, i) => ({
          productId,
          imageUrl: productImageUrl(name),
          isMain: !existingMain && i === 0,
          kind: "photo",
        })),
      );
    }
  } catch {
    await Promise.all(saved.map((name) => removeUpload(name, "products")));
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  await audit("product.image.add", { type: "product", id: productId }, {
    kind,
    count: saved.length,
  });

  revalidateProduct(productId);

  return {
    ok: true,
    message: kind === "logo" ? "Логотип загружен" : `Загружено фото: ${saved.length}`,
  };
}

/**
 * Удаление картинки.
 *
 * Если убрали главное фото, главным становится следующее по счёту:
 * оставлять карточку без большого снимка при живых фотографиях незачем.
 */
export async function deleteProductImage(
  _prev: ImageState,
  formData: FormData,
): Promise<ImageState> {
  if (!(await can("products", "edit"))) {
    return { error: "У вашей роли нет права менять товары" };
  }

  const imageId = Number(String(formData.get("imageId") ?? ""));
  if (!Number.isInteger(imageId) || imageId <= 0) return { error: "Картинка не найдена" };

  const [image] = await db
    .select()
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!image) return { error: "Картинка не найдена" };

  await db.delete(productImages).where(eq(productImages.id, imageId));

  // Записи, перенесённые со старого сайта, ведут в чужую папку - у них
  // разбор имени вернёт null, и диск мы не трогаем
  const filename = productImageFilename(image.imageUrl);
  if (filename) await removeUpload(filename, "products");

  if (image.kind === "photo" && image.isMain) {
    const [next] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(eq(productImages.productId, image.productId), eq(productImages.kind, "photo")),
      )
      .orderBy(asc(productImages.id))
      .limit(1);

    if (next) {
      await db
        .update(productImages)
        .set({ isMain: true })
        .where(eq(productImages.id, next.id));
    }
  }

  await audit("product.image.delete", { type: "product", id: image.productId }, {
    kind: image.kind,
    imageId,
  });

  revalidateProduct(image.productId);

  return { ok: true, message: "Картинка удалена" };
}

/** Главное фото - то, что открывает галерею в карточке товара. */
export async function setMainProductImage(
  _prev: ImageState,
  formData: FormData,
): Promise<ImageState> {
  if (!(await can("products", "edit"))) {
    return { error: "У вашей роли нет права менять товары" };
  }

  const imageId = Number(String(formData.get("imageId") ?? ""));
  if (!Number.isInteger(imageId) || imageId <= 0) return { error: "Картинка не найдена" };

  const [image] = await db
    .select()
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!image) return { error: "Картинка не найдена" };
  if (image.kind !== "photo") return { error: "Главным можно сделать только фото" };

  await db
    .update(productImages)
    .set({ isMain: false })
    .where(
      and(
        eq(productImages.productId, image.productId),
        eq(productImages.kind, "photo"),
        ne(productImages.id, imageId),
      ),
    );

  await db
    .update(productImages)
    .set({ isMain: true })
    .where(eq(productImages.id, imageId));

  await audit("product.image.main", { type: "product", id: image.productId }, { imageId });

  revalidateProduct(image.productId);

  return { ok: true, message: "Главное фото выбрано" };
}
