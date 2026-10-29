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
 * Цены «от» и ступени тиража для списка товаров одним запросом.
 *
 * `from`: id товара -> цена за единицу при минимальном тираже. Товара без
 * базовой цены и без ступеней в карте нет: витрина пишет для него «Цена по
 * запросу». `tiers`: id товара -> ступени по возрастанию тиража; они нужны
 * карточке каталога для переключателя тиража, который пересчитывает цену
 * в браузере.
 */
export async function catalogPricing(items: PricedProduct[]) {
  const from = new Map<number, number>();
  const tiers = new Map<number, PriceTier[]>();
  if (items.length === 0) return { from, tiers };

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

  for (const r of rows) {
    const list = tiers.get(r.productId) ?? [];
    list.push({ minQty: r.minQty, maxQty: r.maxQty, price: r.price });
    tiers.set(r.productId, list);
  }

  for (const item of items) {
    const price = fromUnitPrice({
      basePrice: item.basePrice ?? 0,
      tiers: tiers.get(item.id) ?? [],
      minQuantity: item.minQuantity,
      multiplicity: item.multiplicity,
    });
    if (price > 0) from.set(item.id, price);
  }
  return { from, tiers };
}

/** Только цены «от» - для списков, где ступени не нужны. */
export async function fromPrices(items: PricedProduct[]) {
  return (await catalogPricing(items)).from;
}
