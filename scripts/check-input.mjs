/**
 * Проверка разбора данных, пришедших снаружи.
 *
 *   npm run check:input
 *
 * Четыре правила, каждое держится и на примерах, и на поиске по исходникам
 * (чтобы новый код не вернул старую ошибку):
 *
 * 1. Принадлежность словарю - isKeyOf / Object.hasOwn, а не `raw in DICT`:
 *    «constructor», «toString», «__proto__» не должны быть статусом.
 * 2. Календарные даты из форм - parseCalendarDate с проверкой «туда и
 *    обратно»: 2026-02-31 отклоняется. Голая регулярка на дату в
 *    серверных действиях не допускается.
 * 3. Длина текстовых полей - rejectOverlong в каждом действии, которое
 *    читает свободный текст.
 * 4. Загрузки: макеты клиентов идут не серверным действием, а потоком;
 *    лимит тела действий небольшой.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isKeyOf } from "../src/lib/guards.ts";
import { parseCalendarDate, parseCalendarDateTime, calendarDateAtNoon } from "../src/lib/dates.ts";
import {
  limitFor,
  overlongFields,
  rejectOverlong,
  LIMIT_SHORT,
  LIMIT_TEXT,
} from "../src/lib/text-limits.ts";
import { ORDER_STATUS } from "../src/lib/order-status.ts";
import { LIMITS } from "../src/lib/rate-limit.ts";
import { MAX_UPLOAD_SIZE, CLIENT_UPLOAD_QUOTA } from "../src/lib/client-portal.ts";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");
const sources = walk(path.join(ROOT, "src")).map((file) => ({
  file: rel(file),
  text: fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
}));

// ------------------------------------------------ 1. словари без `in`

const DICT = { open: 1, closed: 2 };
check("isKeyOf: свой ключ проходит", isKeyOf(DICT, "open"));
for (const bad of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "", 5, null]) {
  check(`isKeyOf: «${String(bad)}» не ключ`, !isKeyOf(DICT, bad));
}
check("isKeyOf: настоящий словарь статусов заказа", isKeyOf(ORDER_STATUS, "pending") && !isKeyOf(ORDER_STATUS, "constructor"));

// Ищем `x in CONST` в коде. Комментарии и for..in не считаем; `"key" in obj`
// (разбор объединений типов) - нижний регистр и строка слева, сюда не попадает
const IN_CONST = /[\w\])] in [A-Z][A-Z0-9_]+\b/;
const inHits = [];
for (const { file, text } of sources) {
  text.split("\n").forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    if (/\bfor\s*\(/.test(code)) return;
    if (IN_CONST.test(line)) inHits.push(`${file}:${i + 1}`);
  });
}
check("в src нет проверок вида `raw in CONST`", inHits.length === 0, inHits.join(", "));

// ------------------------------------------------------------ 2. даты

const okDates = ["2026-01-31", "2024-02-29", "2026-12-01", " 2026-05-05 "];
const badDates = [
  "2026-02-31", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00",
  "2026-1-5", "26-01-01", "2026-01-01T00:00", "", "abc", null, undefined, 20260101, "0000-01-01", "9999-01-01",
];
for (const d of okDates) check(`parseCalendarDate принимает «${d}»`, parseCalendarDate(d) === d.trim());
for (const d of badDates) check(`parseCalendarDate отклоняет «${String(d)}»`, parseCalendarDate(d) === null);

check("datetime-local: обычное время", parseCalendarDateTime("2026-03-10T14:30")?.getHours() === 14);
for (const d of ["2026-02-31T10:00", "2026-03-10T24:00", "2026-03-10T10:60", "2026-03-10", "2026-03-10 10:00", "", null]) {
  check(`parseCalendarDateTime отклоняет «${String(d)}»`, parseCalendarDateTime(d) === null);
}
const noon = calendarDateAtNoon("2026-03-10");
check("полдень по местному", noon.getHours() === 12 && noon.getDate() === 10);

// Регулярка на дату в серверных действиях - признак забытого parseCalendarDate
const dateRegex = /\\d\{4\}-\\d\{2\}-\\d\{2\}/;
const dateHits = sources
  .filter((s) => s.file !== "src/lib/dates.ts" && dateRegex.test(s.text))
  .map((s) => s.file);
check("даты из форм не разбираются голой регуляркой", dateHits.length === 0, dateHits.join(", "));

// ------------------------------------------------------ 3. длина текста

check("имя - 255 (varchar в схеме)", limitFor("name") === LIMIT_SHORT);
check("свободный текст - 5000", limitFor("message") === LIMIT_TEXT && limitFor("description") === LIMIT_TEXT);
check("поле с хвостом: comment-12", limitFor("comment-12") === LIMIT_TEXT);
check("свой предел сильнее словаря", limitFor("phone", { phone: 20 }) === 20);
check("id и числа короткие", limitFor("orderId") <= 64 && limitFor("quantity") <= 64 && limitFor("status") <= 64);
check("неизвестное имя - как свободный текст", limitFor("zzz") === LIMIT_TEXT);
check("«constructor» как имя поля не ломает словарь", limitFor("constructor") === LIMIT_TEXT);

const form = new FormData();
form.set("name", "x".repeat(256));
form.set("message", "y".repeat(5000));
form.set("subject", "  ok  ");
form.set("file", new File(["z".repeat(100000)], "a.pdf"));
const over = overlongFields(form);
check("слишком длинное имя найдено", Object.keys(over).join() === "name", JSON.stringify(over));
check("текст по подписи: «Имя»", over.name?.includes("«Имя»") && over.name.includes("255"));
check("файл в проверке длины не участвует", !("file" in over));

const rej = rejectOverlong(form);
check(
  "ответ формы: ok=false, message, error и fieldErrors",
  rej?.ok === false && rej.message === rej.error && "name" in rej.fieldErrors,
);
check("в пределах - null", rejectOverlong(new FormData()) === null);

// Каждое действие, читающее свободный текст, начинается с rejectOverlong
const actionFiles = sources.filter((s) => /^"use server"/m.test(s.text) && s.file.startsWith("src/app/"));
const missing = [];
for (const { file, text } of actionFiles) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^export async function \w+\(/.test(lines[i])) continue;
    let sigEnd = -1;
    for (let k = i; k < Math.min(lines.length, i + 8); k++) {
      if (/Promise<.*>\s*\{\s*$/.test(lines[k])) {
        sigEnd = k;
        break;
      }
    }
    if (sigEnd < 0) continue;
    if (!/formData: FormData/.test(lines.slice(i, sigEnd + 1).join("\n"))) continue;
    let end = sigEnd + 1;
    while (end < lines.length && lines[end] !== "}") end++;
    const body = lines.slice(sigEnd + 1, end).join("\n");
    const names = [...body.matchAll(/formData\.get(?:All)?\(\s*"([^"]+)"/g)].map((m) => m[1]);
    const dynamic = /formData\.get(?:All)?\(\s*[^"\s]/.test(body);
    const textish = dynamic || names.some((n) => limitFor(n) > 64);
    if (textish && !body.includes("rejectOverlong(")) missing.push(`${file}: ${lines[i].slice(0, 60)}`);
  }
}
check("каждое действие с текстом проверяет длину (rejectOverlong)", missing.length === 0, missing.join("; "));

// ------------------------------------------------------------ 4. загрузки

check("файл макета - до 50 МБ", MAX_UPLOAD_SIZE === 50 * 1024 * 1024);
check("квота клиента - 1 ГБ", CLIENT_UPLOAD_QUOTA === 1024 * 1024 * 1024);
check("не больше 50 файлов в сутки", LIMITS.upload.max === 50 && LIMITS.upload.window === 24 * 60 * 60);

const route = sources.find((s) => s.file === "src/app/api/client-uploads/route.ts")?.text ?? "";
check("маршрут загрузки есть и читает тело потоком", route.includes("saveUploadStream(req.body"));
check("маршрут проверяет квоту и суточный лимит", route.includes("CLIENT_UPLOAD_QUOTA") && route.includes('"upload"'));
check("маршрут не собирает multipart целиком", !route.includes("formData()") && !route.includes("arrayBuffer()"));

const clientActions = sources.find((s) => s.file === "src/app/actions/client.ts")?.text ?? "";
check("серверное действие загрузки макета удалено", !clientActions.includes("export async function uploadClientFile"));

const proxy = sources.find((s) => s.file === "src/proxy.ts")?.text ?? "";
check("proxy не буферизует загрузку макетов", proxy.includes("api/client-uploads"));

const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
const limit = /bodySizeLimit:\s*"(\d+)mb"/.exec(nextConfig);
check("лимит тела серверных действий не больше 10 МБ", limit !== null && Number(limit[1]) <= 10, limit?.[0] ?? "не найден");

// Админские загрузки должны влезать в лимит тела вместе со служебными байтами
const { MAX_QC_PHOTO_SIZE } = await import("../src/lib/quality.ts");
const { MAX_PRODUCT_BATCH_SIZE, MAX_PRODUCT_IMAGE_SIZE } = await import("../src/lib/product-images.ts");
const bodyLimit = Number(limit?.[1] ?? 0) * 1024 * 1024;
check(
  "фото брака и пачка картинок влезают в лимит тела действия",
  MAX_QC_PHOTO_SIZE + 64 * 1024 < bodyLimit && MAX_PRODUCT_BATCH_SIZE + 64 * 1024 < bodyLimit,
);
check("одна картинка товара не больше пачки", MAX_PRODUCT_IMAGE_SIZE <= MAX_PRODUCT_BATCH_SIZE);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
