/**
 * Проверки одноразовых кодов (TOTP).
 *
 *   npm run check:totp
 *
 * Второй фактор - единственное, что стоит между админкой и подобранным
 * паролем, поэтому проверяем и совместимость с эталоном из RFC 6238, и
 * поведение на границах окна.
 */
import fs from "node:fs";
import {
  base32Decode,
  base32Encode,
  generateSecret,
  isFreshCounter,
  matchTotpCounter,
  otpauthUrl,
  totpCode,
  totpCounter,
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

// ---- повтор кода (S7): номер окна и правило «строго позже последнего»
const at = 1_700_000_000_000;
const c0 = totpCounter(at);
check("номер окна - секунды / 30", c0 === Math.floor(at / 1000 / 30), String(c0));
check("код текущего окна даёт его номер", matchTotpCounter(secret, totpCode(secret, 0, at), 1, at) === c0);
check("код прошлого окна даёт номер на единицу меньше", matchTotpCounter(secret, totpCode(secret, -1, at), 1, at) === c0 - 1);
check("код следующего окна даёт номер на единицу больше", matchTotpCounter(secret, totpCode(secret, 1, at), 1, at) === c0 + 1);
check("код через два окна номера не даёт", matchTotpCounter(secret, totpCode(secret, 2, at), 1, at) === null);
check("мусор номера не даёт", matchTotpCounter(secret, "abc", 1, at) === null);

check("первый код (счётчика ещё нет) свежий", isFreshCounter(c0, null) && isFreshCounter(c0, undefined));
check("тот же номер уже использован", !isFreshCounter(c0, c0));
check("более ранний номер отвергается", !isFreshCounter(c0 - 1, c0));
check("более поздний номер свежий", isFreshCounter(c0 + 1, c0));

// Сценарий: принят код окна c0+1; ни им же, ни кодом окна c0 больше не войти
let last = null;
const accept = (counter) => {
  if (counter === null || !isFreshCounter(counter, last)) return false;
  last = counter;
  return true;
};
check("сценарий: первый вход проходит", accept(matchTotpCounter(secret, totpCode(secret, 1, at), 1, at)));
check("сценарий: повтор того же кода отвергнут", !accept(matchTotpCounter(secret, totpCode(secret, 1, at), 1, at)));
check("сценарий: код предыдущего окна отвергнут", !accept(matchTotpCounter(secret, totpCode(secret, 0, at), 1, at)));

// ---- то же в базе: запись атомарна, два параллельных запроса с одним кодом
// не проходят оба. Заводим своего пользователя и удаляем за собой.
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}
const { db } = await import("../src/db/index.ts");
const { users } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const { consumeTotp } = await import("../src/lib/totp-db.ts");

const EMAIL = "check-totp-replay@example.invalid";
await db.delete(users).where(eq(users.email, EMAIL));
const dbSecret = generateSecret();
const [row] = await db
  .insert(users)
  .values({ name: "Проверка TOTP", email: EMAIL, password: "не-важно", role: "admin", totpSecret: dbSecret })
  .returning({ id: users.id });

try {
  const now = totpCode(dbSecret, 0);
  const results = await Promise.all([
    consumeTotp(row.id, dbSecret, now),
    consumeTotp(row.id, dbSecret, now),
    consumeTotp(row.id, dbSecret, now),
  ]);
  check("три одновременных запроса с одним кодом: прошёл ровно один", results.filter(Boolean).length === 1, JSON.stringify(results));
  check("повтор того же кода позже отвергнут", !(await consumeTotp(row.id, dbSecret, now)));
  check("код более раннего окна отвергнут", !(await consumeTotp(row.id, dbSecret, totpCode(dbSecret, -1))));

  const [saved] = await db.select({ c: users.totpLastCounter }).from(users).where(eq(users.id, row.id));
  check("в базе запомнено окно принятого кода", saved.c === totpCounter(), String(saved.c));

  check("код следующего окна проходит", await consumeTotp(row.id, dbSecret, totpCode(dbSecret, 1)));
  check("неверный код не проходит", !(await consumeTotp(row.id, dbSecret, "12345a")));
} finally {
  await db.delete(users).where(eq(users.email, EMAIL));
}

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
