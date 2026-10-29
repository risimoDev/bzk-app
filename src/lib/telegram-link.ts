import { createHash, randomInt } from "node:crypto";

/**
 * Код привязки телеграма: чистая часть (без базы), чтобы её проверял скрипт.
 *
 * Прежний код выводился из номера пользователя, времени и секрета: подпись
 * была всего 24 бита, а один и тот же код годился много раз за 15-30 минут.
 * Теперь код случайный, одноразовый и хранится в базе только отпечатком
 * (`telegram_link_codes`, см. `telegram-link-db.ts`).
 */

/** Сколько живёт код привязки. */
export const LINK_CODE_TTL_MINUTES = 15;

/**
 * Алфавит без похожих знаков: нет 0/O, 1/I/L - код переписывают с экрана
 * на телефон, и перепутанная буква не должна стоить попытки.
 */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Десять знаков из 31: около 2^49 вариантов - не подбирается ни при каком лимите. */
export const LINK_CODE_LENGTH = 10;

/** Новый случайный код (без разделителей). `randomInt` не даёт перекоса по модулю. */
export function generateLinkCode() {
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return out;
}

/** «ABCDE-FGHJK» - так код легче читать и диктовать. */
export function formatLinkCode(code: string) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Приводит введённое к каноническому виду или возвращает null, если это
 * не похоже на код: регистр, пробелы и дефис не важны, остальное - отказ
 * (до обращения к базе).
 */
export function normalizeLinkCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[\s-]+/g, "");
  if (cleaned.length !== LINK_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!LINK_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** Отпечаток для хранения: утечка базы не выдаёт живых кодов. */
export function linkCodeHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function linkCodeExpiry(now = Date.now()) {
  return new Date(now + LINK_CODE_TTL_MINUTES * 60_000);
}
