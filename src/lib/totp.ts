import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Одноразовые коды по RFC 6238 (TOTP) - второй фактор для сотрудников.
 *
 * Своя реализация, а не библиотека: алгоритм - это HMAC-SHA1 от номера
 * тридцатисекундного окна и четыре строки арифметики. Ради них тащить
 * зависимость, которую потом никто не обновляет, смысла нет.
 *
 * Совместимо с Google Authenticator, 1Password, Яндекс.Ключом - все они
 * читают ссылку otpauth:// и считают тот же код.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Длина окна в секундах - стандарт, менять нельзя: приложения ждут 30. */
const STEP = 30;
const DIGITS = 6;

/** Base32 без выравнивания «=»: приложения его и не ждут. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** Новый секрет: 20 байт - столько же, сколько отдаёт Google. */
export function generateSecret() {
  return base32Encode(randomBytes(20));
}

/** Номер тридцатисекундного окна, в которое попадает момент `at`. */
export function totpCounter(at = Date.now()) {
  return Math.floor(at / 1000 / STEP);
}

/** Код для конкретного номера окна (RFC 4226, HOTP). */
function codeForCounter(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();

  // «Динамическая усечённая» выборка из RFC 4226: младшие четыре бита
  // последнего байта указывают, откуда брать четыре байта результата
  const idx = hmac[hmac.length - 1] & 0x0f;
  const num =
    ((hmac[idx] & 0x7f) << 24) |
    (hmac[idx + 1] << 16) |
    (hmac[idx + 2] << 8) |
    hmac[idx + 3];

  return String(num % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Код для конкретного окна. Смещение сдвигает окно назад или вперёд. */
export function totpCode(secret: string, offset = 0, at = Date.now()): string {
  return codeForCounter(secret, totpCounter(at) + offset);
}

/**
 * Номер окна, которому принадлежит введённый код, или null, если код не
 * подошёл ни в одном из допустимых окон.
 *
 * Номер, а не просто «да/нет», нужен для защиты от повтора: код живёт до
 * 90 секунд (окно и по соседу с каждой стороны), и подсмотренный через
 * плечо или перехваченный код иначе можно было бы предъявить ещё раз.
 * Принятый номер запоминается (`users.totp_last_counter`), а код с номером
 * не больше запомненного отвергается - см. `isFreshCounter`.
 *
 * Принимаем соседние окна: часы на телефоне почти всегда чуть расходятся
 * с сервером, и без допуска половина честных попыток отвергалась бы.
 * Сравнение - постоянного времени, и перебираются все окна без раннего
 * выхода: по скорости ответа код не подобрать.
 */
export function matchTotpCounter(
  secret: string,
  code: string,
  window = 1,
  at = Date.now(),
): number | null {
  const given = code.replace(/\D/g, "");
  if (given.length !== DIGITS) return null;

  const givenBuf = Buffer.from(given);
  const base = totpCounter(at);
  let matched: number | null = null;

  for (let offset = -window; offset <= window; offset++) {
    const expected = Buffer.from(codeForCounter(secret, base + offset));
    if (expected.length === givenBuf.length && timingSafeEqual(expected, givenBuf)) {
      matched = base + offset;
    }
  }

  return matched;
}

/**
 * Код этого окна ещё не использовался? Пусто (NULL) - второй фактор ещё
 * ни разу не предъявляли. То же условие стоит в SQL (`consumeTotp`):
 * здесь его можно проверить без базы.
 */
export function isFreshCounter(counter: number, last: number | null | undefined) {
  return last === null || last === undefined || counter > last;
}

/**
 * Проверка кода без учёта повтора. Для входа и подтверждений годится
 * только `consumeTotp` (lib/totp-db.ts): он ещё и запоминает код.
 */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  return matchTotpCounter(secret, code, window) !== null;
}

/** Ссылка для приложения-аутентификатора. */
export function otpauthUrl(secret: string, account: string, issuer = "БЗК Принт") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
