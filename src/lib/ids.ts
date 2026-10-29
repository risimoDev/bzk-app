/**
 * Разбор идентификаторов, пришедших снаружи: из формы, адреса, куки.
 *
 * Голый `Number(raw)` пропускает «1.5», «1e3» и 99999999999 - первое
 * падает в Postgres ошибкой типа, последнее - переполнением integer, и
 * человек видит 500 вместо «не найдено». Здесь ни базы, ни Next: модуль
 * подключают и серверный код, и проверочные скрипты.
 */

/** Наибольшее значение `integer` (serial) в Postgres. */
export const MAX_DB_ID = 2_147_483_647;

/**
 * Id записи или null, если это не id.
 *
 * Строка принимается только из цифр: «1e3» и «0x10» - не способ записать
 * номер товара, а подбор. Число - только целое из диапазона integer.
 */
export function parseId(raw: unknown): number | null {
  let n: number;

  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    // Десять цифр - потолок integer; длиннее заведомо не влезет
    if (!/^\d{1,10}$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }

  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_DB_ID ? n : null;
}
