/**
 * Проверка хранилища клиентских файлов.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-uploads.mjs
 *
 * Файлы лежат вне public и отдаются маршрутом с проверкой владельца,
 * поэтому здесь проверяется то, на чём эта защита держится: имя на диске
 * не зависит от присланного, выход из папки вверх невозможен, а формат и
 * размер отсекаются до записи.
 */
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  saveUpload,
  removeUpload,
  uploadExists,
  uploadPath,
} from "../src/lib/uploads.ts";
import { MAX_UPLOAD_SIZE } from "../src/lib/client-portal.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

async function rejects(name, fn, expect) {
  try {
    await fn();
    check(name, false, "ошибки не было");
  } catch (e) {
    check(name, e.message.includes(expect), e.message);
  }
}

const ROOT = path.resolve(process.env.UPLOAD_DIR?.trim() || "./storage/uploads");

// Была ли папка макетов до проверки. Если была - в ней файлы клиентов, и
// удалять её целиком в конце нельзя: проверка убирает только свой файл
const clientsExisted = await stat(path.join(ROOT, "clients")).then(() => true, () => false);

// ---------------------------------------------------------- запись

const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "макет заказа.pdf", {
  type: "application/pdf",
});

const saved = await saveUpload(file);

check(
  "имя на диске случайное, не присланное",
  /^[0-9a-f]{32}\.pdf$/.test(saved.filename),
  saved.filename,
);
check("исходное имя сохранено отдельно", saved.originalName === "макет заказа.pdf");
check("размер записан", saved.size === 4);
check("файл лежит на диске", await uploadExists(saved.filename));

// ------------------------------------------------- отказы до записи

await rejects(
  "исполняемый файл не принимается",
  () => saveUpload(new File([new Uint8Array([1])], "virus.exe")),
  "формат",
);

await rejects(
  "файл без расширения не принимается",
  () => saveUpload(new File([new Uint8Array([1])], "readme")),
  "формат",
);

await rejects("пустой файл не принимается", () => saveUpload(new File([], "a.pdf")), "пустой");

await rejects(
  "файл больше пятидесяти мегабайт не принимается",
  () =>
    saveUpload(
      // Размер берём из свойства, а не из содержимого: держать 50 МБ в
      // памяти ради проверки незачем
      Object.defineProperty(new File([new Uint8Array([1])], "big.zip"), "size", {
        value: MAX_UPLOAD_SIZE + 1,
      }),
    ),
  "50 МБ",
);

// ------------------------------------------------- выход из папки

const traversals = [
  "../../.env",
  "..\\..\\.env",
  "sub/dir/file.pdf",
  "/etc/passwd",
];

for (const name of traversals) {
  const resolved = uploadPath(name);
  check(
    `путь «${name}» остаётся внутри хранилища`,
    resolved.startsWith(path.join(ROOT, "clients") + path.sep),
    resolved,
  );
}

// Имя, которое после basename станет «..», ходом вверх стать не должно
try {
  const p = uploadPath("..");
  check("имя «..» не выводит наверх", false, p);
} catch (e) {
  check("имя «..» отвергнуто", e.message.includes("Недопустимое"), e.message);
}

// ---------------------------------------------------------- удаление

await removeUpload(saved.filename);
check("файл удалён", !(await uploadExists(saved.filename)));

// Повторное удаление не должно падать: записи может не быть, а строка в
// базе всё равно должна убираться
await removeUpload(saved.filename);
check("повторное удаление проходит молча", true);

// Папку убираем, только если сами её и создали
if (!clientsExisted) {
  await rm(path.join(ROOT, "clients"), { recursive: true, force: true }).catch(() => {});
}

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
