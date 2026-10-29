import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productQuantityPrices } from "@/db/schema";
import { fromUnitPrice, type PriceTier } from "@/lib/product-price";

type PricedProduct = {
  id: number;
  basePrice: string | null;
  minQuantity: number;
  multiplicity: number;
};

/**
 * Цены «от» для списка товаров одним запросом к ступеням тиража.
 *
 * Ключ - id товара. Товара без базовой цены и без ступеней в карте нет:
 * витрина пишет для него «Цена по запросу».
 */
export async function fromPrices(items: PricedProduct[]) {
  const result = new Map<number, number>();
  if (items.length === 0) return result;

  const rows = await db
    .select({
      productId: productQuantityPrices.productId,
      minQty: productQuantityPrices.minQty,
      maxQty: productQuantityPrices.maxQty,
      price: productQuantityPrices.price,
    })
    .from(productQuantityPrices)
    .where(inArray(productQuantityPrices.productId, items.map((i) => i.id)))
    .orderBy(asc(productQuantityPrices.minQty));

  const byProduct = new Map<number, PriceTier[]>();
  for (const r of rows) {
    const list = byProduct.get(r.productId) ?? [];
    list.push({ minQty: r.minQty, maxQty: r.maxQty, price: r.price });
    byProduct.set(r.productId, list);
  }

  for (const item of items) {
    const price = fromUnitPrice({
      basePrice: item.basePrice ?? 0,
      tiers: byProduct.get(item.id) ?? [],
      minQuantity: item.minQuantity,
      multiplicity: item.multiplicity,
    });
    if (price > 0) result.set(item.id, price);
  }
  return result;
}
