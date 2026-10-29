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
 * Часовой пояс отчётов - пояс мастерской.
 *
 * Сервер и база могут жить в UTC, и тогда заказ, оформленный 1-го числа
 * до пяти утра по-местному, уезжал в прошлый месяц. Месяцы в отчётах
 * считаются по этому поясу и в SQL (`at time zone`), и здесь.
 */
export const REPORT_TZ = "Asia/Yekaterinburg";

/** Год и месяц момента `now` в поясе отчётов. */
function yearMonthIn(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") };
}

/**
 * Список из последних n месяцев, включая текущий (по поясу отчётов).
 *
 * Нужен, чтобы в графике не пропадали месяцы без заказов: без них
 * картина выглядит ровнее, чем есть на самом деле.
 */
export function lastMonths(n: number, now = new Date()): string[] {
  const { year, month } = yearMonthIn(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    // Считаем в UTC - здесь нужен только номер месяца, без сдвигов пояса
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Доля от максимума - высота столбца в процентах. */
export function barHeight(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  // Минимум в 2% - иначе маленькие месяцы выглядят как пустые
  return Math.max(2, Math.round((value / max) * 100));
}

/**
 * Начало месяца `YYYY-MM` в поясе отчётов как момент времени.
 *
 * Смещение пояса берём у Intl, а не пишем «+05:00» руками: если правила
 * пояса когда-нибудь поменяются, данные tz в Node обновятся сами.
 */
export function reportMonthStart(yearMonth: string): Date {
  const [year, month] = yearMonth.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, 1));
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(utcMidnight)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(utcMidnight.getTime() - offsetMin * 60_000);
}
