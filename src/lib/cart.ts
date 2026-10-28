import { cookies } from "next/headers";
import { inArray, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  productQuantityPrices,
  attributeValues,
  productAttributes,
} from "@/db/schema";
import {
  unitPriceFor,
  normalizeQuantity,
  pickAttributeValues,
  type AttributeChoice,
} from "@/lib/product-price";
import { parseId } from "@/lib/ids";

const COOKIE = "bzk_cart";
const MAX_ITEMS = 40;
/** Потолок количества в строке: дальше - уже не заказ с сайта, а ошибка ввода. */
export const MAX_CART_QUANTITY = 1_000_000;

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
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Кука - чужие данные. Дробный или огромный id долетал до запроса и
    // ронял страницу ошибкой Postgres, поэтому id проверяем как любой
    // внешний ввод, а негодную строку просто выбрасываем
    const lines: CartLine[] = [];
    for (const l of parsed) {
      const p = parseId(l?.p);
      const q: unknown = l?.q;
      if (p === null || !Array.isArray(l?.a)) continue;
      if (typeof q !== "number" || !Number.isSafeInteger(q) || q <= 0) continue;

      lines.push({
        p,
        q: Math.min(q, MAX_CART_QUANTITY),
        a: (l.a as unknown[])
          .map((x) => parseId(x))
          .filter((x): x is number => x !== null)
          .slice(0, 20),
      });
      if (lines.length >= MAX_ITEMS) break;
    }
    return lines;
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
        attributeId: attributeValues.attributeId,
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
      .where(inArray(productAttributes.productId, ids))
      // Порядок характеристик - как в карточке товара
      .orderBy(asc(productAttributes.id), asc(attributeValues.id)),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  const items: CartItem[] = [];

  for (const line of lines) {
    const product = byId.get(line.p);
    // Скрытый или удалённый товар просто выпадает из корзины
    if (!product || product.isHidden) continue;

    // Количество - по правилам товара из базы, а не по тому, что в куке:
    // кука и форма в руках покупателя, и шаг «продаём сотнями» обходился
    // правкой одного поля
    const quantity = normalizeQuantity(line.q, product.minQuantity, product.multiplicity);

    // Набор характеристик проверяется здесь, а не только при добавлении:
    // строку с двумя скидками одной характеристики или без платной опции
    // можно вписать в куку руками. Такая строка выпадает, как скрытый товар
    const productOptions = options.filter((o) => o.productId === line.p);
    const picked = pickAttributeValues(line.a, productOptions);
    if (!picked) continue;

    const chosen = productOptions.filter((o) => picked.includes(o.valueId));
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

/**
 * Правила товара для действий корзины: минимальный тираж, шаг и
 * значения характеристик. Берутся из базы, а не из скрытых полей формы.
 */
export async function cartProduct(productId: number): Promise<{
  minQuantity: number;
  multiplicity: number;
  isHidden: boolean;
  options: AttributeChoice[];
} | null> {
  const [[product], options] = await Promise.all([
    db
      .select({
        minQuantity: products.minQuantity,
        multiplicity: products.multiplicity,
        isHidden: products.isHidden,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1),
    db
      .select({
        valueId: attributeValues.id,
        attributeId: attributeValues.attributeId,
      })
      .from(attributeValues)
      .innerJoin(
        productAttributes,
        eq(attributeValues.attributeId, productAttributes.id),
      )
      .where(eq(productAttributes.productId, productId)),
  ]);

  return product ? { ...product, options } : null;
}

/**
 * Строки, которые покажет resolveCart: товар есть, не скрыт, набор
 * характеристик сходится. Те же правила, но одним запросом и без цен -
 * для счётчика в шапке и для очистки куки.
 */
export async function validCartLines(lines: CartLine[]): Promise<CartLine[]> {
  if (lines.length === 0) return [];

  const ids = [...new Set(lines.map((l) => l.p))];

  // Левые соединения: товар без характеристик тоже должен вернуться
  // строкой, иначе его не отличить от удалённого
  const rows = await db
    .select({
      productId: products.id,
      isHidden: products.isHidden,
      valueId: attributeValues.id,
      attributeId: attributeValues.attributeId,
    })
    .from(products)
    .leftJoin(productAttributes, eq(productAttributes.productId, products.id))
    .leftJoin(attributeValues, eq(attributeValues.attributeId, productAttributes.id))
    .where(inArray(products.id, ids));

  const byProduct = new Map<number, { isHidden: boolean; options: AttributeChoice[] }>();
  for (const r of rows) {
    let product = byProduct.get(r.productId);
    if (!product) {
      product = { isHidden: r.isHidden, options: [] };
      byProduct.set(r.productId, product);
    }
    // Характеристика без значений приходит с пустыми полями значения -
    // её не выбрать, и обязательной она не считается, как в resolveCart
    if (r.valueId !== null && r.attributeId !== null) {
      product.options.push({ valueId: r.valueId, attributeId: r.attributeId });
    }
  }

  return lines.filter((line) => {
    const product = byProduct.get(line.p);
    return (
      product !== undefined &&
      !product.isHidden &&
      pickAttributeValues(line.a, product.options) !== null
    );
  });
}

/** Счётчик в шапке - по тем же правилам, что сама корзина. */
export async function cartCount() {
  return (await validCartLines(await readCart())).length;
}
