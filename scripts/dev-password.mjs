/**
 * Временный пароль администратора для ручной проверки в браузере.
 *
 *   node scripts/dev-password.mjs set      - поставить временный
 *   node scripts/dev-password.mjs restore  - вернуть исходный
 *
 * Зачем: половину новой админки нельзя посмотреть, не войдя, а хранить
 * рабочий пароль в переписке или в файле нельзя. Исходный хеш нигде не
 * сохраняется - он и так лежит в дампе `../schema.sql`, с которым его
 * сверяет `npm run verify-restore`.
 *
 * Работает только против локальной базы: на боевой сервер этот скрипт
 * не должен уметь ничего.
 */
import pg from "pg";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { readSchemaDump } from "./schema-dump.mjs";

/** Кого трогаем. Тот же пользователь, что проверяет verify-restore. */
const USER_ID = 2;
const TEMP_PASSWORD = "Proverka-2026";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env
  .match(/^DATABASE_URL=(.+)$/m)[1]
  // Сначала отрезаем комментарий, потом кавычки: иначе в значении
  // остаётся хвостовая кавычка
  .split("#")[0]
  .trim()
  .replace(/^"|"$/g, "");

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Скрипт только для локальной базы. DATABASE_URL смотрит наружу.");
  process.exitCode = 1;
} else {
  const mode = process.argv[2];
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  if (mode === "set") {
    const hash = bcrypt.hashSync(TEMP_PASSWORD, 10);
    await client.query("update users set password = $1 where id = $2", [hash, USER_ID]);
    console.log(`Пользователю ${USER_ID} поставлен временный пароль: ${TEMP_PASSWORD}`);
    console.log("Не забудьте: node scripts/dev-password.mjs restore");
  } else if (mode === "restore") {
    const dump = readSchemaDump();
    const start = dump.indexOf("INSERT INTO `users`");
    const stmt = dump.slice(start, dump.indexOf(");", start) + 2);
    const rows = stmt.match(/\((?:[^()']|'(?:[^']|\\')*')*\)/g) ?? [];
    const row = rows.find((t) => t.startsWith(`(${USER_ID},`));
    const hash = row?.match(/'(\$2y\$[^']+)'/)?.[1];

    if (!hash) {
      console.error("В дампе не нашёлся исходный хеш - восстанавливать нечем.");
      process.exitCode = 1;
    } else {
      await client.query("update users set password = $1 where id = $2", [hash, USER_ID]);
      console.log(`Пользователю ${USER_ID} возвращён исходный хеш из дампа.`);
    }
  } else {
    console.error("Укажите режим: set или restore");
    process.exitCode = 1;
  }

  await client.end();
}
