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
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  saveUploadStream,
  cleanOriginalName,
  removeUpload,
  uploadExists,
  uploadPath,
} from "../src/lib/uploads.ts";

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

/** Тело запроса из байтов: ровно то, что приходит в маршрут загрузки. */
const stream = (bytes) => new Response(bytes).body;
const save = (bytes, name) => saveUploadStream(stream(bytes), name, "application/pdf");

const saved = await save(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "макет заказа.pdf");

check(
  "имя на диске случайное, не присланное",
  /^[0-9a-f]{32}.pdf$/.test(saved.filename),
  saved.filename,
);
check("исходное имя сохранено отдельно", saved.originalName === "макет заказа.pdf");
check("размер записан", saved.size === 4);
check("файл лежит на диске", await uploadExists(saved.filename));

// ------------------------------------------------- отказы до записи

await rejects("исполняемый файл не принимается", () => save(new Uint8Array([1]), "virus.exe"), "формат");
await rejects("файл без расширения не принимается", () => save(new Uint8Array([1]), "readme"), "формат");
await rejects("пустой файл не принимается", () => save(new Uint8Array(0), "a.pdf"), "пустой");

// Предел считается по пришедшим байтам, а не по заголовку: маленький
// предел и файл побольше. Недописанный файл не должен остаться на диске
const before = new Set(await readdir(path.join(ROOT, "clients")));
await rejects(
  "файл больше предела обрывается на лету",
  () => saveUploadStream(stream(new Uint8Array(2048)), "big.zip", "application/zip", 1024),
  "50 МБ",
);
const after = await readdir(path.join(ROOT, "clients"));
check("после отказа на диске ничего не осталось", after.every((n) => before.has(n)));

// ------------------------------------------- имя из заголовка запроса

check("имя декодируется", cleanOriginalName(encodeURIComponent("макет 1.pdf")) === "макет 1.pdf");
check("путь в имени отсекается", cleanOriginalName(encodeURIComponent("../../etc/passwd")) === "passwd");
check("обратные слэши тоже", cleanOriginalName(encodeURIComponent(String.raw`..\..\a.pdf`)) === "a.pdf");
check("пустое имя отвергается", cleanOriginalName("") === null);
check("битое кодирование отвергается", cleanOriginalName("%E0%A4%A") === null);

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
process.exitCode = failed === 0 ? 0 : 1;
