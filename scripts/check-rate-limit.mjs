/**
 * Проверка ограничения попыток.
 *
 *   npm run check:rate-limit
 *
 * Работает с настоящей таблицей rate_limits - записи со своим ключом
 * скрипт за собой убирает. Проверяется то, ради чего всё и делалось:
 * что после исчерпания попыток отказ действительно приходит, что окно
 * скользящее и что успешный вход счётчик снимает.
 */
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const { LIMITS, checkRateLimit, recordAttempt, clearAttempts, attemptCount, retryAfterText } =
  await import("../src/lib/rate-limit.ts");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const KEY = "проверка@example.invalid";

await clearAttempts(KEY, "login");

// ------------------------------------------------------- счёт попыток

const { max } = LIMITS.login;
check("лимит входа задан разумно", max >= 3 && max <= 10, `${max} попыток`);

let verdict = await checkRateLimit(KEY, "login");
check("на чистом ключе пускает", verdict.ok);

for (let i = 1; i < max; i++) {
  await recordAttempt(KEY, "login");
  verdict = await checkRateLimit(KEY, "login");
  check(`после ${i} неудач ещё пускает`, verdict.ok);
}

await recordAttempt(KEY, "login");
verdict = await checkRateLimit(KEY, "login");
check(`после ${max} неудач отказывает`, !verdict.ok);
check("говорит, сколько ждать", verdict.retryAfter > 0 && verdict.retryAfter <= LIMITS.login.window,
  `${verdict.retryAfter} с`);

// Лишние попытки сверх лимита не должны отодвигать разблокировку:
// окно считается от самой ранней попытки, а не от последней
const before = (await checkRateLimit(KEY, "login")).retryAfter;
await recordAttempt(KEY, "login");
const after = (await checkRateLimit(KEY, "login")).retryAfter;
check("окно не продлевается новыми попытками", after <= before, `${before} с → ${after} с`);

// --------------------------------------------------------- снятие

await clearAttempts(KEY, "login");
check("успешный вход снимает счётчик", (await checkRateLimit(KEY, "login")).ok);
check("записей не осталось", (await attemptCount(KEY, "login")) === 0);

// --------------------------------------------------- разные ключи

await recordAttempt(KEY, "login");
check(
  "чужой ключ не задет",
  (await attemptCount("другой@example.invalid", "login")) === 0,
);
check(
  "другое действие не задето",
  (await attemptCount(KEY, "register")) === 0,
);
await clearAttempts(KEY, "login");

// Длинная почта не должна делить счётчик с другой длинной почтой,
// у которой совпадает начало
const longA = "о".repeat(120) + "a@example.invalid";
const longB = "о".repeat(120) + "b@example.invalid";
await recordAttempt(longA, "login");
check("длинные адреса не сливаются", (await attemptCount(longB, "login")) === 0);
await clearAttempts(longA, "login");
await clearAttempts(longB, "login");

// ------------------------------------------------------------ текст

check("минуты склоняются", retryAfterText(61) === "через 2 минуты", retryAfterText(61));
check("одна минута", retryAfterText(30) === "через минуту", retryAfterText(30));
check("пять минут", retryAfterText(300) === "через 5 минут", retryAfterText(300));
check("одиннадцать минут", retryAfterText(11 * 60) === "через 11 минут", retryAfterText(11 * 60));

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
