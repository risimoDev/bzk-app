/**
 * Строки УПД и счёта: как привести их сумму к итогу заказа.
 *
 * Чистая арифметика без базы - чтобы её можно было проверить скриптом.
 * Все расчёты ведутся в копейках целыми числами (BigInt): иначе на
 * больших суммах доля скидки теряет копейки на округлении, а сумма строк
 * перестаёт совпадать с итогом документа.
 */

export type UpdRowLike = {
  quantity: number;
  /** Сумма строки целиком, ₽. */
  sum: number;
  /** Цена за единицу, ₽. */
  price: number;
};

// Литерал 0n недоступен при целевой ES2017
const ZERO = BigInt(0);
const kopecks = (rub: number) => BigInt(Math.round(rub * 100));
const rubles = (k: bigint) => Number(k) / 100;

/** Цена за единицу = сумма / количество, до копейки. */
export function unitPriceOf(sum: number, quantity: number): number {
  return quantity > 0 ? Math.round((sum / quantity) * 100) / 100 : 0;
}

/**
 * Уменьшает суммы строк так, чтобы их общая сумма стала ровно `target`.
 *
 * Скидка делится пропорционально сумме строки. Доли округляются вниз, а
 * копеечный остаток (меньше числа строк) уходит в последнюю строку; если
 * она слишком мала, чтобы его принять, - в предыдущие. Сумма строки не
 * бывает отрицательной. Если `target` не меньше текущей суммы, строки
 * возвращаются как были: наценку этой функцией не распределяем.
 */
export function distributeDiscount(sums: number[], target: number): number[] {
  const parts = sums.map(kopecks);
  const total = parts.reduce((s, k) => s + k, ZERO);
  const goal = kopecks(Math.max(0, target));
  if (total <= ZERO || goal >= total) return sums.slice();

  const discount = total - goal;
  const shares = parts.map((k) => (discount * k) / total);
  let rest = discount - shares.reduce((s, k) => s + k, ZERO);

  // Остаток - с последней строки; запас у строки - то, что от неё осталось
  for (let i = parts.length - 1; i >= 0 && rest > ZERO; i--) {
    const room = parts[i] - shares[i];
    const take = room < rest ? room : rest;
    shares[i] += take;
    rest -= take;
  }

  return parts.map((k, i) => rubles(k - shares[i]));
}

export type SettledRows<T extends UpdRowLike> = {
  rows: T[];
  /** Сумма строк после распределения, ₽ (в копейках точная). */
  total: number;
  /** Скидка, ушедшая в строки, ₽. */
  discount: number;
  /** Наценка сверх строк, ₽ - выводится отдельной строкой документа. */
  extra: number;
};

/**
 * Сводит строки с итогом заказа.
 *
 * Итог больше суммы строк (срочность, доставка) - разница остаётся
 * наценкой и печатается отдельной строкой. Итог меньше (промокод,
 * корректировка вниз) - разница распределяется по строкам: отрицательная
 * строка «Корректировка стоимости» в первичном документе недопустима, а
 * цена за единицу пересчитывается из новой суммы.
 */
export function settleRows<T extends UpdRowLike>(rows: T[], orderTotal: number): SettledRows<T> {
  const before = rows.reduce((s, r) => s + kopecks(r.sum), ZERO);
  const goal = kopecks(orderTotal);

  if (goal >= before) {
    return { rows, total: rubles(before), discount: 0, extra: rubles(goal - before) };
  }

  const sums = distributeDiscount(
    rows.map((r) => r.sum),
    orderTotal,
  );
  const next = rows.map((r, i) => ({
    ...r,
    sum: sums[i],
    price: unitPriceOf(sums[i], r.quantity),
  }));
  const after = sums.reduce((s, v) => s + kopecks(v), ZERO);

  return { rows: next, total: rubles(after), discount: rubles(before - after), extra: 0 };
}
