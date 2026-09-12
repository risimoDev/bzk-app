import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.resolve("src") + path.sep).href;

export function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    // Пакет существует только чтобы сборка ругалась на импорт с клиента;
    // в скрипте он ничего не делает
    return { url: "data:text/javascript,export {}", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    // В коде приложения импорты без расширения - их дописывает сборщик.
    // Здесь дописываем сами, иначе node не найдёт файл. Пробуем сначала
    // файл, потом папку с index.ts: `@/db` - это src/db/index.ts
    const base = SRC + specifier.slice(2);
    if (/\.[a-z]+$/.test(base)) return next(base, context);

    const asFile = base + ".ts";
    if (existsSync(fileURLToPath(asFile))) return next(asFile, context);

    return next(base + "/index.ts", context);
  }
  return next(specifier, context);
}
