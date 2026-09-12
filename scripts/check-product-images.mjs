/**
 * Проверка картинок товара.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-product-images.mjs
 *
 * Здесь стережётся то, на чём держится и витрина, и безопасность выдачи:
 * логотип и фотография не путаются местами, имя файла на диске не
 * зависит от присланного, адрес разбирается обратно в имя однозначно, а
 * унаследованные со старого сайта пути не принимаются за наши - иначе
 * удаление записи полезло бы стирать чужой файл.
 */
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { saveProductImage, removeUpload, uploadExists, uploadPath } from "../src/lib/uploads.ts";
import {
  MAX_PRODUCT_IMAGE_SIZE,
  PRODUCT_IMAGE_NAME,
  PRODUCT_IMAGE_EXTENSIONS,
  catalogImageUrl,
  isProductImageKind,
  productImageFilename,
  productImageUrl,
} from "../src/lib/product-images.ts";

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
const BUCKET = path.join(ROOT, "products");

// Была ли папка до проверки. Если была - в ней живые картинки каталога,
// и в конце удаляем только свой файл, а не папку целиком: однажды именно
// так проверка стёрла все загруженные логотипы
const bucketExisted = await stat(BUCKET).then(() => true, () => false);

// Однопиксельный PNG: настоящее содержимое тут не нужно, важно имя и вес
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ------------------------------------------------------------- запись

const saved = await saveProductImage(
  new File([PNG], "логотип визитки.PNG", { type: "image/png" }),
);

check("имя на диске случайное, не присланное", PRODUCT_IMAGE_NAME.test(saved.filename), saved.filename);
check("расширение приведено к нижнему регистру", saved.filename.endsWith(".png"));
check("исходное имя сохранено отдельно", saved.originalName === "логотип визитки.PNG");
check("файл лежит в папке товаров", await uploadExists(saved.filename, "products"));
check(
  "в клиентские макеты картинка не попала",
  !(await uploadExists(saved.filename, "clients")),
);

// ------------------------------------------------- отказы до записи

await rejects(
  "макет в PDF картинкой товара не принимается",
  () => saveProductImage(new File([PNG], "маленькая.pdf")),
  "картинка",
);

await rejects(
  // SVG отдаёт наш же домен, а внутри может лежать скрипт
  "SVG не принимается",
  () => saveProductImage(new File([PNG], "logo.svg")),
  "картинка",
);

await rejects(
  "файл без расширения не принимается",
  () => saveProductImage(new File([PNG], "logo")),
  "картинка",
);

await rejects("пустой файл не принимается", () => saveProductImage(new File([], "a.png")), "пустой");

await rejects(
  "картинка больше восьми мегабайт не принимается",
  () =>
    saveProductImage(
      // Размер берём из свойства: держать 8 МБ в памяти ради проверки незачем
      Object.defineProperty(new File([PNG], "big.jpg"), "size", {
        value: MAX_PRODUCT_IMAGE_SIZE + 1,
      }),
    ),
  "8 МБ",
);

// --------------------------------------------------- выход из папки

for (const name of ["../../.env", "..\\..\\.env", "sub/dir/a.png", "/etc/passwd"]) {
  const resolved = uploadPath(name, "products");
  check(
    `путь «${name}» остаётся внутри папки товаров`,
    resolved.startsWith(BUCKET + path.sep),
    resolved,
  );
}

// ------------------------------------------------------- адрес выдачи

const url = productImageUrl(saved.filename);
check("адрес ведёт в маршрут выдачи", url === `/api/product-image/${saved.filename}`);
check("адрес разбирается обратно в имя", productImageFilename(url) === saved.filename);

const notOurs = [
  // Так выглядят записи, перенесённые со старого сайта: файла у нас нет,
  // и удаление такой записи не должно трогать диск
  "/storage/uploads/product_8_690a75a14c3ff_854d42a59fb1771b.webp",
  "/api/product-image/../../.env",
  "/api/product-image/logo.svg",
  "/api/product-image/",
  "https://example.com/api/product-image/" + saved.filename,
  "",
];

for (const value of notOurs) {
  check(`адрес «${value || "пусто"}» не считается нашим файлом`, productImageFilename(value) === null);
}

check("null разбирается без падения", productImageFilename(null) === null);

// Всё, что маршрут выдачи готов отдать, должно разбираться в имя, и наоборот
for (const ext of PRODUCT_IMAGE_EXTENSIONS) {
  const name = `${"a".repeat(32)}.${ext}`;
  check(
    `имя с расширением .${ext} проходит и маршрут, и разбор`,
    PRODUCT_IMAGE_NAME.test(name) && productImageFilename(`/api/product-image/${name}`) === name,
  );
}

// ---------------------------------------------------- лого и фото

check("логотип - известное назначение", isProductImageKind("logo"));
check("фотография - известное назначение", isProductImageKind("photo"));
for (const value of ["main", "", null, undefined, 1]) {
  check(`назначение «${String(value)}» отвергнуто`, !isProductImageKind(value));
}

check(
  "в каталоге показывается логотип",
  catalogImageUrl({ logoUrl: "/api/product-image/l.webp", photoUrl: "/api/product-image/p.webp" }) ===
    "/api/product-image/l.webp",
);
check(
  "без логотипа в каталог идёт главное фото",
  catalogImageUrl({ logoUrl: null, photoUrl: "/api/product-image/p.webp" }) ===
    "/api/product-image/p.webp",
);
check("без картинок вовсе - пусто", catalogImageUrl({ logoUrl: null, photoUrl: null }) === null);

// ---------------------------------------------------------- удаление

await removeUpload(saved.filename, "products");
check("файл удалён", !(await uploadExists(saved.filename, "products")));

// Записи со старого сайта удаляются без файла - повтор не должен падать
await removeUpload(saved.filename, "products");
check("повторное удаление проходит молча", true);

// Папку убираем, только если сами её и создали
if (!bucketExisted) await rm(BUCKET, { recursive: true, force: true }).catch(() => {});

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
