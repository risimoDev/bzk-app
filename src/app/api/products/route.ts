import { NextResponse } from "next/server";
import { inArray, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { catalogImages } from "@/lib/product-images-db";
import { catalogImageUrl } from "@/lib/product-images";
import { fromPrices } from "@/lib/catalog-price-db";

/**
 * Карточки товаров по списку id: GET /api/products?ids=1,2,3
 *
 * Нужен избранному - оно хранится в браузере, как и на старом сайте,
 * поэтому сервер получает только идентификаторы.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";

  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 100); // потолок, чтобы подделанный список не положил запрос

  if (ids.length === 0) return NextResponse.json({ items: [] });

  // Картинку берём тем же подзапросом, что и каталог: в списке
  // показывается логотип вида работы, а не фото готовой работы
  const image = catalogImages();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      basePrice: products.basePrice,
      minQuantity: products.minQuantity,
      multiplicity: products.multiplicity,
      unit: products.unit,
      categoryName: categories.name,
      logoUrl: image.logoUrl,
      photoUrl: image.photoUrl,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(image, eq(image.productId, products.id))
    .where(and(inArray(products.id, ids), eq(products.isHidden, false)));

  // Наружу отдаём одну готовую ссылку: избранное на клиенте не должно
  // знать, чем логотип отличается от фотографии. Цена - «от»: за единицу
  // при минимальном тираже, как в каталоге, а не базовая
  const prices = await fromPrices(rows);
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    unit: r.unit,
    categoryName: r.categoryName,
    fromPrice: prices.get(r.id) ?? null,
    imageUrl: catalogImageUrl({ logoUrl: r.logoUrl, photoUrl: r.photoUrl }),
  }));

  return NextResponse.json({ items });
}
