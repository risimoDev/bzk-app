/**
 * Проверка ссылок на смену пароля.
 *
 *   npm run check:password-reset
 *
 * Ссылка даёт доступ к аккаунту без пароля, поэтому проверяется главное:
 * что в базе лежит отпечаток, а не сама ссылка; что просроченная и чужая
 * не подходят; что новая ссылка гасит предыдущую; что заблокированному
 * аккаунту ссылка не открывает вход.
 *
 * Скрипт заводит собственного пользователя и удаляет его за собой -
 * настоящих аккаунтов не касается.
 */
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index.ts");
const { users } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const {
  makeResetToken,
  fingerprint,
  issueResetToken,
  findByResetToken,
  clearResetToken,
  RESET_TTL_MINUTES,
} = await import("../src/lib/password-reset.ts");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const EMAIL = "проверка-сброса@example.invalid";

// Убираем следы прошлого запуска, если он падал на середине
await db.delete(users).where(eq(users.email, EMAIL));

const [user] = await db
  .insert(users)
  .values({
    name: "Проверка сброса",
    email: EMAIL,
    password: "не-важно",
    role: "user",
  })
  .returning({ id: users.id });

try {
  // ----------------------------------------------------- сам токен

  const raw = makeResetToken();
  check("токен длинный и шестнадцатеричный", /^[0-9a-f]{64}$/.test(raw), `${raw.length} знаков`);
  check("отпечаток не равен токену", fingerprint(raw) !== raw);
  check("срок ссылки два часа", RESET_TTL_MINUTES === 120, `${RESET_TTL_MINUTES} мин`);

  // --------------------------------------------------- выдача

  const token = await issueResetToken(user.id);

  const [stored] = await db
    .select({ resetToken: users.resetToken, expires: users.resetTokenExpires })
    .from(users)
    .where(eq(users.id, user.id));

  check("в базе лежит отпечаток, а не ссылка", stored.resetToken !== token);
  check("отпечаток совпадает с ожидаемым", stored.resetToken === fingerprint(token));
  check("срок проставлен", stored.expires instanceof Date && stored.expires > new Date());

  const found = await findByResetToken(token);
  check("свой токен открывает аккаунт", found?.id === user.id);

  // ---------------------------------------------------- чужие

  check("другой токен не подходит", (await findByResetToken(makeResetToken())) === null);
  check("мусор не подходит", (await findByResetToken("не-токен")) === null);
  check("пустая строка не подходит", (await findByResetToken("")) === null);
  check(
    "отпечаток вместо токена не подходит",
    (await findByResetToken(fingerprint(token))) === null,
  );

  // ------------------------------------------------ срок годности

  await db
    .update(users)
    .set({ resetTokenExpires: new Date(Date.now() - 60_000) })
    .where(eq(users.id, user.id));

  check("просроченный токен не подходит", (await findByResetToken(token)) === null);

  // ------------------------------------------- новая гасит старую

  const first = await issueResetToken(user.id);
  const second = await issueResetToken(user.id);

  check("новая ссылка работает", (await findByResetToken(second))?.id === user.id);
  check("прежняя ссылка перестала работать", (await findByResetToken(first)) === null);

  // ---------------------------------------------- блокировка

  await db.update(users).set({ isBlocked: true }).where(eq(users.id, user.id));
  check("заблокированному ссылка не помогает", (await findByResetToken(second)) === null);
  await db.update(users).set({ isBlocked: false }).where(eq(users.id, user.id));

  // -------------------------------------------------- гашение

  const third = await issueResetToken(user.id);
  await clearResetToken(user.id);
  check("после гашения токен мёртв", (await findByResetToken(third)) === null);

  const [cleared] = await db
    .select({ resetToken: users.resetToken, expires: users.resetTokenExpires })
    .from(users)
    .where(eq(users.id, user.id));

  check(
    "колонки очищены",
    cleared.resetToken === null && cleared.expires === null,
  );
} finally {
  await db.delete(users).where(eq(users.email, EMAIL));
}

const [{ left }] = await db
  .select({ left: users.id })
  .from(users)
  .where(eq(users.email, EMAIL))
  .then((rows) => (rows.length ? rows : [{ left: null }]));

check("тестовый пользователь удалён", left === null);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
