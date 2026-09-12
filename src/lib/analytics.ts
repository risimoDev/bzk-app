/**
 * Аналитика по деньгам и заказам.
 *
 * Считается по orders_accounting - это единственная таблица, где доход,
 * расход и налог лежат вместе и по сайтовым, и по внешним заказам.
 * Складывать выручку по orders и external_orders напрямую нельзя:
 * налог и себестоимость там не хранятся.
 */

export type MonthPoint = {
  /** Первое число месяца */
  month: string;
  income: number;
  expense: number;
  tax: number;
  profit: number;
  orders: number;
};

/**
 * Прибыль после расходов и налога.
 *
 * Общие расходы фирмы сюда не входят: они не привязаны к заказу, и в
 * бухгалтерии вычитаются отдельно - из-за этого итог там меньше.
 *
 * Ноль приводим к положительному: «−0 ₽» в таблице выглядит как убыток,
 * которого нет.
 */
export function profitOf(income: number, expense: number, tax: number) {
  const value = +(income - expense - tax).toFixed(2);
  return value === 0 ? 0 : value;
}

/** Рентабельность в процентах от выручки. */
export function marginOf(income: number, profit: number) {
  if (income <= 0) return 0;
  return Math.round((profit / income) * 1000) / 10;
}

const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

/** «сен 26» - коротко, чтобы влезало в подпись столбца. */
export function monthLabel(iso: string) {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1]} ${year.slice(2)}`;
}

/**
 * Список из последних n месяцев, включая текущий.
 *
 * Нужен, чтобы в графике не пропадали месяцы без заказов: без них
 * картина выглядит ровнее, чем есть на самом деле.
 */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Доля от максимума - высота столбца в процентах. */
export function barHeight(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  // Минимум в 2% - иначе маленькие месяцы выглядят как пустые
  return Math.max(2, Math.round((value / max) * 100));
}
