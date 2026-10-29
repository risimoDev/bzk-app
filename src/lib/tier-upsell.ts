/**
 * Подсказки по тиражу: «возьмите больше - выйдет дешевле за штуку» и
 * варианты тиража для карточки в каталоге.
 *
 * Чистая логика поверх `product-price.ts`: цены считает та же
 * `unitPriceFor`, что и корзина, поэтому цифры в подсказке совпадают с
 * теми, что человек увидит после «В корзину». Ни базы, ни React - файл
 * подключают и браузер, и проверочные скрипты.
 */
import { normalizeQuantity, unitPriceFor, type PriceTier } from "@/lib/product-price";

/** Копейки: деньги в корзине считаются и показываются с точностью до них. */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type TierUpsell = {
  currentQty: number;
  currentUnit: number;
  currentTotal: number;
  /** Тираж следующей выгодной ступени - уже с учётом минимума и кратности. */
  nextQty: number;
  nextUnit: number;
  nextTotal: number;
  /**
   * Сколько надо доплатить за следующий тираж. Бывает нулевым и даже
   * отрицательным: у ступени с крутой скидкой тираж дороже по цене за
   * штуку, но дешевле по сумме - подсказка в этом случае говорит так, а
   * не «доплатите минус рубль».
   */
  extra: number;
  /**
   * Экономия на штуке в целых процентах, округлённая вниз - чтобы не
   * пообещать лишнего. null, если выходит меньше процента: «−0%» не
   * довод.
   */
  savingPercent: number | null;
};

/**
 * Следующая ступень с меньшей ценой за штуку, чем сейчас.
 *
 * Берётся ближайшая по тиражу ступень, где цена действительно ниже:
 * ступень с той же ценой (бывает, когда в базе разбили диапазон) не
 * повод звать на больший тираж. Тираж ступени подгоняется под минимум и
 * кратность товара, а цена считается на ПОДОГНАННОМ тираже - при
 * пересекающихся диапазонах он может попасть в другую ступень.
 *
 * `surcharge` - надбавка выбранных характеристик за штуку, как в корзине.
 * Нет такой ступени - null, и блока подсказки нет.
 */
export function nextTierUpsell(input: {
  basePrice: string | number;
  tiers: PriceTier[];
  quantity: number;
  minQuantity: number;
  multiplicity: number;
  surcharge?: number;
}): TierUpsell | null {
  const { basePrice, minQuantity, multiplicity } = input;
  const surcharge = input.surcharge ?? 0;
  const tiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty);
  const currentQty = normalizeQuantity(input.quantity, minQuantity, multiplicity);
  const currentUnit = unitPriceFor({ basePrice, tiers, quantity: currentQty, surcharge });

  for (const tier of tiers) {
    if (tier.minQty <= currentQty) continue;
    const nextQty = normalizeQuantity(tier.minQty, minQuantity, multiplicity);
    if (nextQty <= currentQty) continue;
    const nextUnit = unitPriceFor({ basePrice, tiers, quantity: nextQty, surcharge });
    if (!(nextUnit < currentUnit)) continue;

    const currentTotal = round2(currentUnit * currentQty);
    const nextTotal = round2(nextUnit * nextQty);
    const percent = Math.floor(((currentUnit - nextUnit) / currentUnit) * 100);
    return {
      currentQty,
      currentUnit,
      currentTotal,
      nextQty,
      nextUnit,
      nextTotal,
      extra: round2(nextTotal - currentTotal),
      savingPercent: percent >= 1 ? percent : null,
    };
  }
  return null;
}

export type CatalogTierOption = {
  quantity: number;
  unitPrice: number;
  total: number;
};

/**
 * Тиражи для переключателя на карточке каталога: минимальный и ступени,
 * не больше `limit` штук.
 *
 * Тираж каждой ступени подгоняется под минимум и кратность, повторы
 * убираются. Ступень, где цена за штуку не ниже предыдущей, пропускается:
 * кнопка, после нажатия на которую цена не меняется, только сбивает.
 * Если вариантов больше лимита, берутся первый, последний и средний -
 * так человек видит весь размах цен.
 *
 * `surcharge` - надбавка исполнения по умолчанию (первое значение каждой
 * характеристики, `defaultSurcharge`): форма товара выбирает именно его,
 * и сумма на карточке должна совпасть с суммой в форме и в корзине.
 */
export function catalogTierOptions(input: {
  basePrice: string | number;
  tiers: PriceTier[];
  minQuantity: number;
  multiplicity: number;
  surcharge?: number;
  limit?: number;
}): CatalogTierOption[] {
  const { basePrice, minQuantity, multiplicity } = input;
  const surcharge = input.surcharge ?? 0;
  const limit = Math.max(1, input.limit ?? 3);
  const tiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty);

  const quantities = [
    normalizeQuantity(minQuantity, minQuantity, multiplicity),
    ...tiers.map((t) => normalizeQuantity(t.minQty, minQuantity, multiplicity)),
  ];

  const kept: CatalogTierOption[] = [];
  for (const quantity of [...new Set(quantities)].sort((a, b) => a - b)) {
    const unitPrice = unitPriceFor({ basePrice, tiers, quantity, surcharge });
    const last = kept.at(-1);
    if (last && !(unitPrice < last.unitPrice)) continue;
    kept.push({ quantity, unitPrice, total: round2(unitPrice * quantity) });
  }

  if (kept.length <= limit) return kept;
  if (limit === 1) return [kept[0]];
  if (limit === 2) return [kept[0], kept[kept.length - 1]];
  // Для лимита больше трёх середина добирается равномерно
  const picked = new Set<number>([0, kept.length - 1]);
  for (let i = 1; picked.size < limit; i++) {
    picked.add(Math.round((i * (kept.length - 1)) / (limit - 1)));
  }
  return [...picked].sort((a, b) => a - b).map((i) => kept[i]);
}
