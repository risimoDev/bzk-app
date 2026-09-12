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
