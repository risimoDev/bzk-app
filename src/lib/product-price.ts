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
