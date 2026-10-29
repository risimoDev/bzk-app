/**
 * Цена товара за единицу по тиражу.
 *
 * Одна формула на корзину и на карточку товара: сумма, которую человек
 * видит до «В корзину», обязана совпасть с той, что посчитает сервер.
 * Поэтому здесь нет ни базы, ни React - файл подключают и серверный
 * расчёт корзины, и клиентская форма.
 */

export type PriceTier = {
  minQty: number;
  maxQty: number | null;
  price: string | number;
};

/**
 * Ступень, в которую попадает количество.
 *
 * Берётся последняя подходящая: ступени приходят по возрастанию
 * минимального тиража, и при пересечении диапазонов выигрывает более
 * крупный тираж. Так считал старый сайт, и на этом правиле стоят цены в
 * базе - менять его нельзя.
 */
export function tierFor<T extends PriceTier>(tiers: T[], quantity: number): T | undefined {
  return tiers
    .filter((t) => t.minQty <= quantity)
    .filter((t) => t.maxQty === null || quantity <= t.maxQty)
    .at(-1);
}

/** Цена за единицу: ступень тиража (или базовая) плюс надбавки характеристик. */
export function unitPriceFor(input: {
  basePrice: string | number;
  tiers: PriceTier[];
  quantity: number;
  surcharge?: number;
}) {
  const tier = tierFor(input.tiers, input.quantity);
  const base = Number(tier?.price ?? input.basePrice);
  return Math.max(0, base + (input.surcharge ?? 0));
}

/**
 * Количество, которое примет корзина: целое, не меньше минимального
 * тиража и кратное шагу. Округляем вверх - «дайте 150», когда продают
 * сотнями, значит двести, а не сто.
 */
export function normalizeQuantity(raw: number, minQuantity: number, multiplicity: number) {
  const q = Math.max(minQuantity, Math.floor(raw) || minQuantity);
  if (multiplicity <= 1) return q;
  return Math.ceil(q / multiplicity) * multiplicity;
}

/** Значение характеристики товара: к какой характеристике оно относится. */
export type AttributeChoice = { valueId: number; attributeId: number };

/**
 * Набор характеристик позиции: ровно одно значение на каждую
 * характеристику товара.
 *
 * `options` - все значения характеристик ЭТОГО товара. Значения чужих
 * товаров отбрасываются молча: их надбавка к этому товару отношения не
 * имеет. А вот два значения одной характеристики или пропущенная
 * характеристика - отказ (null): иначе подправленной формой или кукой
 * можно сложить две скидки или не выбрать платную опцию вовсе, и заказ
 * уйдёт по цене, которой на сайте нет.
 *
 * Возвращает id значений по возрастанию - в том виде, в каком они
 * хранятся в корзине.
 */
export function pickAttributeValues(
  chosen: readonly number[],
  options: readonly AttributeChoice[],
): number[] | null {
  const attributeOf = new Map(options.map((o) => [o.valueId, o.attributeId]));
  const picked = new Map<number, number>();

  // Повтор одного и того же значения - не второй выбор, а тот же самый
  for (const valueId of new Set(chosen)) {
    const attributeId = attributeOf.get(valueId);
    if (attributeId === undefined) continue;
    if (picked.has(attributeId)) return null;
    picked.set(attributeId, valueId);
  }

  // Характеристика без значений сюда не попадает вовсе: выбирать в ней
  // нечего, и карточка товара её не показывает
  const required = new Set(options.map((o) => o.attributeId));
  if (picked.size !== required.size) return null;

  return [...picked.values()].sort((a, b) => a - b);
}

/**
 * Цена «от» для витрины: за единицу при минимальном тираже.
 *
 * Раньше витрина показывала `base_price` как есть, а реальная цена при
 * заказе берётся из ступени тиража: у товара с базовой ценой 15 ₽ и
 * ступенью «от 100 шт. - 4 ₽» на карточке красовалось 15, в корзине
 * выходило 4. Считаем той же `unitPriceFor`, что и корзина, на минимальном
 * тираже, округлённом до кратности, - тогда «от» совпадает с первой
 * строкой корзины.
 */
export function fromUnitPrice(input: {
  basePrice: string | number;
  tiers: PriceTier[];
  minQuantity: number;
  multiplicity: number;
}) {
  const quantity = normalizeQuantity(input.minQuantity, input.minQuantity, input.multiplicity);
  const tiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty);
  return unitPriceFor({ basePrice: input.basePrice, tiers, quantity });
}
