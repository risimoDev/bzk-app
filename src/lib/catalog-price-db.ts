import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attributeValues, productAttributes, productQuantityPrices } from "@/db/schema";
import { defaultSurcharge, fromUnitPrice, type PriceTier } from "@/lib/product-price";

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
 * в браузере. `surcharges`: id товара -> надбавка исполнения по умолчанию
 * (первое значение каждой характеристики, как выбирает форма товара);
 * цена «от» считается уже с ней, иначе на карточке было бы меньше, чем в
 * форме.
 */
export async function catalogPricing(items: PricedProduct[]) {
  const from = new Map<number, number>();
  const tiers = new Map<number, PriceTier[]>();
  const surcharges = new Map<number, number>();
  if (items.length === 0) return { from, tiers, surcharges };

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

  const attrRows = await db
    .select({
      productId: productAttributes.productId,
      attributeId: attributeValues.attributeId,
      valueId: attributeValues.id,
      priceModifier: attributeValues.priceModifier,
    })
    .from(attributeValues)
    .innerJoin(productAttributes, eq(productAttributes.id, attributeValues.attributeId))
    .where(inArray(productAttributes.productId, items.map((i) => i.id)));
  const byProduct = new Map<number, typeof attrRows>();
  for (const r of attrRows) {
    const list = byProduct.get(r.productId) ?? [];
    list.push(r);
    byProduct.set(r.productId, list);
  }
  for (const [productId, list] of byProduct) {
    const s = defaultSurcharge(list);
    if (s !== 0) surcharges.set(productId, s);
  }

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
      surcharge: surcharges.get(item.id),
    });
    if (price > 0) from.set(item.id, price);
  }
  return { from, tiers, surcharges };
}

/** Только цены «от» - для списков, где ступени не нужны. */
export async function fromPrices(items: PricedProduct[]) {
  return (await catalogPricing(items)).from;
}
