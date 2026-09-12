/**
 * Строка подключения к базе для служебных скриптов.
 *
 * В контейнере файла `.env` нет (он в `.dockerignore`), а переменные
 * приходят через окружение Docker Compose. На машине разработчика,
 * наоборот, окружение пустое, а `.env` лежит рядом. Поэтому сначала
 * смотрим `process.env.DATABASE_URL`, а уже потом - файл.
 */
import fs from "node:fs";

export function databaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return stripQuotes(fromEnv);

  try {
    const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    const line = env.match(/^DATABASE_URL=(.+)$/m);
    if (line) {
      // Сначала комментарий, потом кавычки - иначе в значении остаётся хвост
      return stripQuotes(line[1].split("#")[0].trim());
    }
  } catch {
    // .env нет - значит рассчитывали на окружение, а его тоже нет
  }

  throw new Error("Не задан DATABASE_URL: ни в окружении, ни в .env");
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}
