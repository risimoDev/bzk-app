/**
 * Где лежит дамп боевой базы старого сайта.
 *
 * Раньше проект жил в `bzk/bzk-app`, и дамп находился по `../schema.sql`.
 * Потом папку подняли на уровень выше, и путь перестал существовать -
 * `dev-password restore` и `verify-restore` падали с ENOENT. Поэтому
 * место дампа ищется по списку, а не задаётся одной строкой.
 *
 * Переопределить можно переменной SCHEMA_DUMP.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = [
  process.env.SCHEMA_DUMP,
  path.join(ROOT, "..", "schema.sql"),
  path.join(ROOT, "..", "bzk", "schema.sql"),
].filter(Boolean);

export function schemaDumpPath() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "Не найден дамп schema.sql. Искал:\n  " +
        CANDIDATES.join("\n  ") +
        "\nУкажите путь переменной SCHEMA_DUMP.",
    );
  }
  return found;
}

export function readSchemaDump() {
  return fs.readFileSync(schemaDumpPath(), "utf8");
}
