/**
 * Проверка кода привязки телеграма.
 *
 *   npm run check:telegram
 *
 * На этом коде держится вся привязка чата к аккаунту. В старом боте её
 * не было вовсе: команда «/connect почта» связывала чат с аккаунтом по
 * одному только адресу. Потом код выводился из номера и времени, имел
 * 24 бита подписи и годился много раз. Теперь он случайный, длинный,
 * одноразовый и лежит в базе только отпечатком - это и проверяем.
 *
 * Скрипт заводит своего пользователя и удаляет его за собой.
 */
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  // Комментарий отрезаем до кавычек: наоборот хвостовая кавычка осталась
  // бы частью значения
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const {
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  LINK_CODE_TTL_MINUTES,
  generateLinkCode,
  formatLinkCode,
  normalizeLinkCode,
  linkCodeHash,
  linkCodeExpiry,
} = await import("../src/lib/telegram-link.ts");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

// ------------------------------------------------------- сам код

const code = generateLinkCode();
check("длина не меньше десяти знаков", code.length >= 10 && code.length === LINK_CODE_LENGTH, code);
check(
  "только знаки алфавита",
  [...code].every((ch) => LINK_CODE_ALPHABET.includes(ch)),
);
check(
  "в алфавите нет похожих знаков (0 O 1 I L)",
  !/[01OIL]/.test(LINK_CODE_ALPHABET),
  LINK_CODE_ALPHABET,
);
check(
  "энтропия не меньше 48 бит",
  Math.log2(LINK_CODE_ALPHABET.length) * LINK_CODE_LENGTH >= 48,
  `${(Math.log2(LINK_CODE_ALPHABET.length) * LINK_CODE_LENGTH).toFixed(1)} бит`,
);

const many = new Set(Array.from({ length: 2000 }, () => generateLinkCode()));
check("коды не повторяются (2000 штук)", many.size === 2000);

// Все знаки алфавита должны встречаться, иначе генератор перекошен
const seen = new Set(Array.from({ length: 4000 }, () => generateLinkCode()).join(""));
check("встречаются все знаки алфавита", seen.size === LINK_CODE_ALPHABET.length, `${seen.size}`);

// ---------------------------------------------------- ввод

const shown = formatLinkCode(code);
check("показанный вид - две группы через дефис", /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(shown), shown);
check("показанный код разбирается обратно", normalizeLinkCode(shown) === code);
check("регистр не важен", normalizeLinkCode(shown.toLowerCase()) === code);
check("пробелы вокруг и внутри не мешают", normalizeLinkCode(`  ${code.slice(0, 3)} ${code.slice(3)} `) === code);
check("слишком короткий отвергнут", normalizeLinkCode(code.slice(0, 9)) === null);
check("слишком длинный отвергнут", normalizeLinkCode(code + "A") === null);
check("знак вне алфавита отвергнут", normalizeLinkCode("0".repeat(10)) === null);
check("пустая строка отвергнута", normalizeLinkCode("") === null);
check("прежний формат «2-9F3A17» отвергнут", normalizeLinkCode("2-9F3A17") === null);

// ------------------------------------------------- отпечаток и срок

check("отпечаток - sha256 в шестнадцатеричном виде", /^[0-9a-f]{64}$/.test(linkCodeHash(code)));
check("отпечаток не равен коду", linkCodeHash(code) !== code);
check("разные коды - разные отпечатки", linkCodeHash(code) !== linkCodeHash(generateLinkCode()));

const t0 = Date.UTC(2026, 8, 5, 12, 0, 0);
check("срок жизни - 15 минут", LINK_CODE_TTL_MINUTES === 15);
check(
  "срок отсчитывается от выдачи",
  linkCodeExpiry(t0).getTime() === t0 + 15 * 60_000,
);

// ------------------------------------------------------- база

const { db } = await import("../src/db/index.ts");
const { users, telegramLinkCodes } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const { issueLinkCode, consumeLinkCode, linkChatToUser } = await import(
  "../src/lib/telegram-link-db.ts"
);

const EMAIL = "check-telegram-link@example.invalid";
const EMAIL2 = "check-telegram-link-2@example.invalid";
const CHAT = "999000111";

async function cleanup() {
  await db.delete(users).where(eq(users.email, EMAIL));
  await db.delete(users).where(eq(users.email, EMAIL2));
}
await cleanup();

const [u1] = await db
  .insert(users)
  .values({ name: "Проверка привязки", email: EMAIL, password: "не-важно", role: "user" })
  .returning({ id: users.id });
const [u2] = await db
  .insert(users)
  .values({ name: "Проверка привязки 2", email: EMAIL2, password: "не-важно", role: "user" })
  .returning({ id: users.id });

try {
  const issued = await issueLinkCode(u1.id);
  const [stored] = await db
    .select()
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.userId, u1.id));

  check("в базе лежит отпечаток, а не сам код", stored.codeHash === linkCodeHash(issued) && stored.codeHash !== issued);
  check(
    "срок в базе - около 15 минут",
    Math.abs(stored.expiresAt.getTime() - Date.now() - 15 * 60_000) < 60_000,
  );

  // Погашение: ровно один из параллельных вводов
  const parallel = await Promise.all([
    consumeLinkCode(issued),
    consumeLinkCode(formatLinkCode(issued)),
    consumeLinkCode(issued.toLowerCase()),
  ]);
  check(
    "одновременный ввод одного кода: проходит ровно один",
    parallel.filter((id) => id === u1.id).length === 1 && parallel.filter((id) => id === null).length === 2,
    JSON.stringify(parallel),
  );
  check("повторный ввод того же кода отвергнут", (await consumeLinkCode(issued)) === null);

  // Новый код гасит прежний
  const first = await issueLinkCode(u1.id);
  const second = await issueLinkCode(u1.id);
  check("новый код гасит предыдущий", (await consumeLinkCode(first)) === null);
  check("новый код работает и отдаёт своего пользователя", (await consumeLinkCode(second)) === u1.id);

  // Чужой пользователь получает свой код, а не чужой
  const other = await issueLinkCode(u2.id);
  check("код второго пользователя открывает второго", (await consumeLinkCode(other)) === u2.id);

  // Просроченный код не принимается и убирается при следующей выдаче
  const stale = await issueLinkCode(u2.id);
  await db
    .update(telegramLinkCodes)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(telegramLinkCodes.codeHash, linkCodeHash(stale)));
  check("просроченный код отвергнут", (await consumeLinkCode(stale)) === null);

  // consumeLinkCode просроченный не удаляет - его убирает выдача чужого кода
  const [leftover] = await db
    .select({ id: telegramLinkCodes.id })
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.codeHash, linkCodeHash(stale)));
  check("просроченный код пока лежит в базе", Boolean(leftover));
  await issueLinkCode(u1.id);
  const [gone] = await db
    .select({ id: telegramLinkCodes.id })
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.codeHash, linkCodeHash(stale)));
  check("выдача нового кода убирает чужие просроченные", !gone);

  // Привязка чата: один чат - один аккаунт
  const linked = await linkChatToUser(u1.id, CHAT);
  check("привязка возвращает пользователя с почтой", linked?.id === u1.id && linked.email === EMAIL);
  await linkChatToUser(u2.id, CHAT);
  const rows = await db
    .select({ id: users.id, chat: users.telegramChatId })
    .from(users)
    .where(eq(users.telegramChatId, CHAT));
  check("чат остался только у последнего владельца", rows.length === 1 && rows[0].id === u2.id);

  // Заблокированному не привязываем
  await db.update(users).set({ isBlocked: true }).where(eq(users.id, u1.id));
  check("заблокированному аккаунту привязка отказывает", (await linkChatToUser(u1.id, "999000222")) === null);
} finally {
  await cleanup();
}

const [leftUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
check("тестовые пользователи удалены", !leftUser);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
