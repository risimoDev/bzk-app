import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Токен второго шага входа.
 *
 * Капча на входе нужна, чтобы отсечь автоматический подбор пароля. Раньше
 * второй шаг (ввод кода 2FA) пропускал её по одному признаку - непустому
 * полю `totp`, и бот обходил капчу, просто дописывая это поле к каждой
 * попытке. Теперь пропуск капчи надо заслужить: токен выдаётся только
 * тому, кто на первом шаге прошёл капчу и ввёл верный пароль.
 *
 * Токен - «момент выдачи.подпись», подпись HMAC-SHA256 на AUTH_SECRET от
 * почты и момента выдачи. В базе ничего не храним: подделать подпись без
 * секрета нельзя, а срок жизни зашит в сам токен.
 *
 * Модуль намеренно не тянет `@/auth` и `next/headers` - его проверяет
 * скрипт под голым node.
 */

/** Сколько живёт токен: хватает, чтобы открыть приложение и набрать код. */
export const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Насколько момент выдачи может быть «в будущем». Сервер один, но часы
 * контейнера могут чуть подвинуться между запросами - не отказываем из-за
 * пары секунд.
 */
const CLOCK_SKEW_MS = 30 * 1000;

/** Секрет читаем при вызове: скрипты проверки задают его после импорта. */
function defaultSecret() {
  return process.env.AUTH_SECRET?.trim() ?? "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sign(email: string, issuedAt: number, secret: string) {
  // Приставка отделяет эту подпись от других HMAC на том же секрете:
  // подпись, выданная для другого назначения, сюда не подойдёт
  return createHmac("sha256", secret)
    .update(`login-2fa:${normalizeEmail(email)}:${issuedAt}`)
    .digest("base64url");
}

/**
 * Выдаёт токен для почты. Без секрета возвращает пустую строку - тогда
 * второй шаг просто снова спросит капчу.
 */
export function issueLoginChallenge(
  email: string,
  now = Date.now(),
  secret = defaultSecret(),
): string {
  if (!secret) return "";
  return `${now}.${sign(email, now, secret)}`;
}

/**
 * Адрес HTTP-маршрута Auth.js, который ведёт к проверке пароля
 * (`/api/auth/callback/credentials` и родственные). Такие запросы
 * маршрут отклоняет: вход по паролю идёт только через действие формы,
 * где стоят капча и токен второго шага.
 *
 * Сегменты разбираем так же, как Auth.js (parseActionAndProviderId):
 * пустые выкидываются, поэтому `callback//credentials` для него - то же
 * самое, и строгим сравнением адреса его не поймать.
 */
export function isCredentialsAuthPath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Кривая кодировка - сравним как есть; Auth.js такой адрес тоже не разберёт
  }
  return path.toLowerCase().split("/").filter(Boolean).includes("credentials");
}

/** Токен подлинный, выдан для этой почты и ещё не истёк. */
export function verifyLoginChallenge(
  token: string,
  email: string,
  now = Date.now(),
  secret = defaultSecret(),
): boolean {
  if (!secret || !token || !email) return false;

  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token.trim());
  if (!match) return false;

  const issuedAt = Number(match[1]);
  if (!Number.isSafeInteger(issuedAt)) return false;
  if (issuedAt > now + CLOCK_SKEW_MS) return false;
  if (now - issuedAt > LOGIN_CHALLENGE_TTL_MS) return false;

  const expected = Buffer.from(sign(email, issuedAt, secret));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
