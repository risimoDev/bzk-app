import { cookies } from "next/headers";
import { inArray, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  productQuantityPrices,
  attributeValues,
  productAttributes,
} from "@/db/schema";
import { unitPriceFor } from "@/lib/product-price";

const COOKIE = "bzk_cart";
const MAX_ITEMS = 40;

/** Позиция корзины в том виде, в каком она лежит в куке. */
export type CartLine = {
  /** id товара */
  p: number;
  /** количество */
  q: number;
  /** id выбранных значений характеристик */
  a: number[];
};

export type CartItem = {
  key: string;
  productId: number;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  multiplicity: number;
  /** Цена за единицу с учётом тиража и выбранных характеристик */
  unitPrice: number;
  lineTotal: number;
  options: { attribute: string; value: string; modifier: number }[];
  imageUrl: string | null;
};

/** Ключ позиции: товар плюс набор характеристик. */
export const lineKey = (line: CartLine) =>
  `${line.p}:${[...line.a].sort((x, y) => x - y).join(",")}`;

export async function readCart(): Promise<CartLine[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (l): l is CartLine =>
          typeof l?.p === "number" &&
          typeof l?.q === "number" &&
          l.q > 0 &&
          Array.isArray(l?.a),
      )
      .slice(0, MAX_ITEMS)
      .map((l) => ({
        p: l.p,
        q: Math.min(l.q, 1_000_000),
        a: l.a.filter((x) => typeof x === "number").slice(0, 20),
      }));
  } catch {
    // Испорченную куку молча считаем пустой корзиной - падать из-за неё
    // на каждой странице хуже, чем потерять содержимое
    return [];
  }
}

export async function writeCart(lines: CartLine[]) {
  const jar = await cookies();

  if (lines.length === 0) {
    jar.delete(COOKIE);
    return;
  }

  jar.set(COOKIE, JSON.stringify(lines.slice(0, MAX_ITEMS)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Считает корзину по данным из базы.
 *
 * Цена НИКОГДА не берётся из куки - только пересчитывается здесь. Иначе
 * достаточно подправить куку в браузере, чтобы оформить заказ по своей цене.
 */
export async function resolveCart(lines: CartLine[]): Promise<CartItem[]> {
  if (lines.length === 0) return [];

  const ids = [...new Set(lines.map((l) => l.p))];

  const [rows, tiers, options] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        basePrice: products.basePrice,
        minQuantity: products.minQuantity,
        multiplicity: products.multiplicity,
        isHidden: products.isHidden,
      })
      .from(products)
      .where(inArray(products.id, ids)),
    db
      .select()
      .from(productQuantityPrices)
      .where(inArray(productQuantityPrices.productId, ids))
      .orderBy(asc(productQuantityPrices.minQty)),
    db
      .select({
        valueId: attributeValues.id,
        value: attributeValues.value,
        modifier: attributeValues.priceModifier,
        attribute: productAttributes.name,
        productId: productAttributes.productId,
      })
      .from(attributeValues)
      .innerJoin(
        productAttributes,
        eq(attributeValues.attributeId, productAttributes.id),
      )
      .where(inArray(productAttributes.productId, ids)),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  const items: CartItem[] = [];

  for (const line of lines) {
    const product = byId.get(line.p);
    // Скрытый или удалённый товар просто выпадает из корзины
    if (!product || product.isHidden) continue;

    const quantity = Math.max(line.q, product.minQuantity);

    const chosen = options.filter(
      (o) => o.productId === line.p && line.a.includes(o.valueId),
    );
    const surcharge = chosen.reduce((sum, o) => sum + Number(o.modifier ?? 0), 0);

    // Та же формула, что показывает карточка товара до добавления в корзину
    const unitPrice = unitPriceFor({
      basePrice: product.basePrice,
      tiers: tiers.filter((t) => t.productId === line.p),
      quantity,
      surcharge,
    });

    items.push({
      key: lineKey(line),
      productId: product.id,
      name: product.name,
      unit: product.unit ?? "шт.",
      quantity,
      minQuantity: product.minQuantity,
      multiplicity: product.multiplicity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      options: chosen.map((o) => ({
        attribute: o.attribute,
        value: o.value,
        modifier: Number(o.modifier ?? 0),
      })),
      imageUrl: null,
    });
  }

  return items;
}

export async function cartCount() {
  const lines = await readCart();
  return lines.length;
}
