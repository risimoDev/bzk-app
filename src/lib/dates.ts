/**
 * Работа с календарными датами.
 *
 * Колонки типа `date` хранят календарный день без времени. Если положить
 * туда объект Date, драйвер возьмёт день по UTC - и в Перми (UTC+5) всё,
 * что записано между полуночью и пятью утра, окажется вчерашним числом.
 * Для дат поставки и готовности это сдвиг на сутки, который никто не
 * заметит до разбирательства с клиентом.
 */

/** Часовой пояс компании. Совпадает с TZ в docker-compose. */
export const TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Yekaterinburg";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Календарный день в часовом поясе компании, как 'ГГГГ-ММ-ДД'. */
export function localDate(at: Date = new Date()): string {
  // en-CA даёт ровно ISO-подобный формат, который принимает Postgres
  return formatter.format(at);
}

/**
 * Разбирает календарный день из базы для показа.
 *
 * Строку 'ГГГГ-ММ-ДД' нельзя отдавать в Intl напрямую, а new Date(строка)
 * трактует её как полночь UTC и в нашем поясе покажет предыдущий день.
 * Поэтому собираем дату по частям - она получается локальной.
 */
export function parseLocalDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Наибольший разумный год в формах: дальше - опечатка, а не срок. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/**
 * Календарный день из поля формы: 'ГГГГ-ММ-ДД' или null.
 *
 * Одной регулярки мало: «2026-02-31» ей соответствует, Postgres такое
 * отвергает ошибкой (500 вместо подсказки), а new Date молча сдвигает на
 * 3 марта. Поэтому после разбора день собирается обратно и сверяется с
 * исходным (round-trip): несуществующее число не проходит.
 */
export function parseCalendarDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;

  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Дата и время из datetime-local: 'ГГГГ-ММ-ДДTЧЧ:ММ' как местное время
 * (в нём менеджер и назначает звонок) или null. Дату проверяет
 * parseCalendarDate, время - диапазон часов и минут.
 */
export function parseCalendarDateTime(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;

  const day = parseCalendarDate(m[1]);
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  if (!day || hh > 23 || mm > 59) return null;

  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, hh, mm);
}

/**
 * Календарный день как момент времени - полдень по местному. Для колонок
 * timestamp, где срок - день: полдень не съезжает на соседнее число ни в
 * одну сторону при пересчёте часового пояса.
 */
export function calendarDateAtNoon(day: string): Date {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, 12);
}
