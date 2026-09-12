/**
 * Проверки одноразовых кодов (TOTP).
 *
 *   npm run check:totp
 *
 * Второй фактор - единственное, что стоит между админкой и подобранным
 * паролем, поэтому проверяем и совместимость с эталоном из RFC 6238, и
 * поведение на границах окна.
 */
import {
  base32Decode,
  base32Encode,
  generateSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "@/lib/totp";

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

// ---- base32 в обе стороны
const bytes = Buffer.from("12345678901234567890", "ascii");
const encoded = base32Encode(bytes);
check("base32 кодирует", encoded === "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", encoded);
check("base32 разбирает обратно", base32Decode(encoded).equals(bytes));
check(
  "разделители и регистр не мешают",
  base32Decode(encoded.toLowerCase().replace(/(.{4})/g, "$1 ")).equals(bytes),
);

// ---- эталон из RFC 6238 для секрета «12345678901234567890»
//
// В приложении RFC значения даны для времени в секундах; берём момент
// внутри нужного окна и сверяем шестизначный код.
const rfcSecret = encoded;
const vectors = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

for (const [seconds, expected] of vectors) {
  const got = totpCode(rfcSecret, 0, seconds * 1000);
  check(`эталон RFC 6238 на ${seconds}`, got === expected, `${got} (ждём ${expected})`);
}

// ---- проверка кода
const secret = generateSecret();
check("секрет нужной длины", secret.length === 32, `${secret.length} знаков`);
check("свой код подходит", verifyTotp(secret, totpCode(secret)));
check("код прошлого окна принимается", verifyTotp(secret, totpCode(secret, -1)));
check("код следующего окна принимается", verifyTotp(secret, totpCode(secret, 1)));
check("код через два окна отвергнут", !verifyTotp(secret, totpCode(secret, 2)));
check("чужой секрет не подходит", !verifyTotp(generateSecret(), totpCode(secret)));
check("мусор отвергнут", !verifyTotp(secret, "abcdef"));
check("пустая строка отвергнута", !verifyTotp(secret, ""));
check("короткий код отвергнут", !verifyTotp(secret, "1234"));
check(
  "пробелы в коде не мешают",
  verifyTotp(secret, totpCode(secret).replace(/(\d{3})/, "$1 ")),
);

// ---- ссылка для приложения
const url = otpauthUrl(secret, "lev@example.com");
check("ссылка otpauth собрана", url.startsWith("otpauth://totp/"), url.slice(0, 40));
check("в ссылке есть секрет", url.includes(`secret=${secret}`));
check("в ссылке есть издатель", url.includes("issuer="));

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
