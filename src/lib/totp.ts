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

/** Код для конкретного окна. Смещение сдвигает окно назад или вперёд. */
export function totpCode(secret: string, offset = 0, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP) + offset;

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

/**
 * Проверка кода.
 *
 * Принимаем соседние окна: часы на телефоне почти всегда чуть расходятся
 * с сервером, и без допуска половина честных попыток отвергалась бы.
 * Сравнение - постоянного времени: по скорости ответа код не подберёшь.
 */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const given = code.replace(/\D/g, "");
  if (given.length !== DIGITS) return false;

  const givenBuf = Buffer.from(given);

  for (let offset = -window; offset <= window; offset++) {
    const expected = Buffer.from(totpCode(secret, offset));
    if (expected.length === givenBuf.length && timingSafeEqual(expected, givenBuf)) {
      return true;
    }
  }

  return false;
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
