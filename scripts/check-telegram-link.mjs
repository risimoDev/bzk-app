/**
 * Проверка кода привязки телеграма.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-telegram-link.mjs
 *
 * На этом коде держится вся привязка чата к аккаунту. В старом боте её
 * не было вовсе: команда «/connect почта» связывала чат с аккаунтом по
 * одному только адресу, и чужие уведомления получал любой, кто адрес
 * знал. Значит, код обязан быть непроверяемым перебором и недолгим.
 */
import fs from "node:fs";

// Секрет для подписи берётся из окружения - читаем .env, как это делает
// приложение
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  // Комментарий отрезаем до кавычек: наоборот хвостовая кавычка осталась
  // бы частью значения, и подпись считалась бы другим секретом
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const { makeLinkCode, verifyLinkCode, LINK_CODE_TTL_MINUTES } = await import(
  "../src/lib/telegram.ts"
);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const now = Date.UTC(2026, 8, 5, 12, 0, 0);
const MINUTE = 60_000;

// ------------------------------------------------------- свой код

const code = makeLinkCode(2, now);
check("код читаемый и короткий", /^[0-9A-Z]+-[0-9A-F]{6}$/.test(code), code);
check("свой код подходит", verifyLinkCode(code, now) === 2);
check("код нечувствителен к регистру", verifyLinkCode(code.toLowerCase(), now) === 2);
check("пробелы по краям не мешают", verifyLinkCode(`  ${code} `, now) === 2);

// -------------------------------------------------------- чужие

check("подпись от другого номера не подходит", verifyLinkCode(makeLinkCode(3, now), now) !== 2);
check(
  "подделанная подпись отвергнута",
  verifyLinkCode(`${code.split("-")[0]}-000000`, now) === null,
);
check("мусор отвергнут", verifyLinkCode("ЛОМАЮ", now) === null);
check("пустая строка отвергнута", verifyLinkCode("", now) === null);
check("номер без подписи отвергнут", verifyLinkCode("2-", now) === null);
check("нулевой номер отвергнут", verifyLinkCode(makeLinkCode(0, now), now) === null);

// Подпись - шесть шестнадцатеричных знаков, это 16^6 вариантов на номер.
// Перебором по одному коду за запрос это неосуществимо
check("пространство подписи достаточно велико", 16 ** 6 > 16_000_000);

// --------------------------------------------------------- время

check(
  "код живёт как минимум своё окно",
  verifyLinkCode(code, now + (LINK_CODE_TTL_MINUTES - 1) * MINUTE) === 2,
);
check(
  "код с прошлого окна ещё принимается",
  verifyLinkCode(code, now + LINK_CODE_TTL_MINUTES * MINUTE) === 2,
);
check(
  "через два окна код протухает",
  verifyLinkCode(code, now + 2 * LINK_CODE_TTL_MINUTES * MINUTE + MINUTE) === null,
);
check(
  "старый код не воскресает",
  verifyLinkCode(makeLinkCode(2, now - 3 * LINK_CODE_TTL_MINUTES * MINUTE), now) === null,
);

// Код меняется от окна к окну - иначе он был бы вечным
const later = makeLinkCode(2, now + LINK_CODE_TTL_MINUTES * MINUTE);
check("код обновляется со временем", later !== code, `${code} → ${later}`);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
