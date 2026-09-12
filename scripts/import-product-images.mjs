/**
 * Перенос картинок товаров из папки в хранилище.
 *
 *   node scripts/import-product-images.mjs --list   показать товары и их id
 *   node scripts/import-product-images.mjs --dry    показать, что будет сделано
 *   node scripts/import-product-images.mjs          перенести
 *   node scripts/import-product-images.mjs --keep   перенести, не убирая исходники
 *
 * Откуда берёт:
 *
 *   assets-src/products/logos/   - логотипы для каталога, по одному на товар
 *   assets-src/products/photos/  - фотографии готовых работ, сколько угодно
 *
 * Имя файла должно начинаться с id товара, а за ним - дефис, подчёркивание,
 * пробел или точка: «8.png», «8-vizitki.png», «205 листовки 2.jpg». В photos/ можно вместо
 * этого завести папку с именем-id и сложить снимки в неё.
 *
 * Что делает: ужимает картинку и переводит в WebP (в браузер уедет
 * гораздо меньше), кладёт под случайным именем в storage/uploads/products
 * и заводит запись в product_images. Логотип у товара один - прежний
 * удаляется вместе с файлом. Фотографии добавляются, первая становится
 * главной.
 *
 * Идемпотентность: перенесённые исходники уезжают в
 * assets-src/products/_imported/, поэтому повторный запуск ничего не
 * задваивает. С флагом --keep исходники остаются на месте - тогда
 * следить за повторами придётся самому.
 */
import pg from "pg";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

// ------------------------------------------------------------ окружение

/**
 * Разбор .env: сперва отрезаем комментарий, потом кавычки. В обратном
 * порядке в значении остаётся хвостовая кавычка - на этом уже терялся
 * AUTH_SECRET.
 */
function envValue(text, name) {
  const line = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!line) return "";
  return line[1]
    .replace(/\s+#.*$/, "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = envValue(env, "DATABASE_URL");
const UPLOAD_DIR = path.resolve(envValue(env, "UPLOAD_DIR") || "./storage/uploads");

const SRC = path.resolve("assets-src/products");
const DEST = path.join(UPLOAD_DIR, "products");
const DONE = path.join(SRC, "_imported");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const keep = args.includes("--keep");

/**
 * Правила пережатия. Логотипу тысяча точек по стороне не нужна: он живёт
 * в плитке каталога размером с ладонь.
 */
const RULES = {
  logo: { maxWidth: 900, quality: 84 },
  photo: { maxWidth: 1600, quality: 82 },
};

const SOURCE_EXT = [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".tif", ".tiff"];

const client = new pg.Client({ connectionString: DATABASE_URL });

// ------------------------------------------------------------ разбор папок

/**
 * id товара из имени файла: цифры в начале, за ними разделитель.
 *
 * Разделитель обязателен: без него «9ab02ff1-…png» - случайное имя из
 * генератора картинок - читалось как товар № 9 и молча подменяло его
 * логотип.
 */
function productIdOf(name) {
  const m = name.match(/^(\d+)(?:[-_ .]|$)/);
  return m ? Number(m[1]) : null;
}

/** Собирает пары «файл - товар» из папки одного назначения. */
function collect(kind) {
  const dir = path.join(SRC, kind === "logo" ? "logos" : "photos");
  if (!fs.existsSync(dir)) return [];

  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Папка с именем-id: всё, что внутри, относится к этому товару
    if (entry.isDirectory()) {
      const id = productIdOf(entry.name);
      if (id === null) {
        console.log(`Пропускаю ${entry.name}/ - имя папки не начинается с id товара`);
        continue;
      }
      for (const file of fs.readdirSync(path.join(dir, entry.name))) {
        if (!SOURCE_EXT.includes(path.extname(file).toLowerCase())) continue;
        found.push({ kind, productId: id, file: path.join(dir, entry.name, file) });
      }
      continue;
    }

    if (!SOURCE_EXT.includes(path.extname(entry.name).toLowerCase())) continue;

    const id = productIdOf(entry.name);
    if (id === null) {
      console.log(`Пропускаю ${entry.name} - имя не начинается с id товара`);
      continue;
    }
    found.push({ kind, productId: id, file: path.join(dir, entry.name) });
  }

  return found.sort((a, b) => a.file.localeCompare(b.file, "ru"));
}

// ------------------------------------------------------------------ --list

async function list() {
  const { rows } = await client.query(`
    SELECT p.id, p.name, c.name AS category,
           count(*) FILTER (WHERE i.kind = 'logo')  AS logos,
           count(*) FILTER (WHERE i.kind <> 'logo') AS photos
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images i ON i.product_id = p.id
     GROUP BY p.id, p.name, c.name
     ORDER BY c.name NULLS FIRST, p.name
  `);

  console.log("id".padStart(5) + "  " + "товар".padEnd(44) + "лого  фото");
  console.log("-".repeat(65));
  for (const r of rows) {
    console.log(
      String(r.id).padStart(5) +
        "  " +
        r.name.slice(0, 42).padEnd(44) +
        String(r.logos).padStart(4) +
        String(r.photos).padStart(6),
    );
  }
}

// ---------------------------------------------------------------- перенос

async function importAll() {
  const tasks = [...collect("logo"), ...collect("photo")];

  if (tasks.length === 0) {
    console.log(
      `Нечего переносить. Положите файлы в ${path.relative(process.cwd(), SRC)}, ` +
        "в папки logos и photos, назвав их по id товара.",
    );
    return;
  }

  // Товары проверяем разом: в имени файла мог оказаться и несуществующий id
  const ids = [...new Set(tasks.map((t) => t.productId))];
  const { rows: known } = await client.query(
    "SELECT id, name FROM products WHERE id = ANY($1::int[])",
    [ids],
  );
  const names = new Map(known.map((r) => [r.id, r.name]));

  if (!dry) {
    fs.mkdirSync(DEST, { recursive: true });
    if (!keep) fs.mkdirSync(DONE, { recursive: true });
  }

  let added = 0;
  let skipped = 0;
  let replaced = 0;

  for (const task of tasks) {
    const shortName = path.relative(SRC, task.file);
    const productName = names.get(task.productId);
    const role = task.kind === "logo" ? "логотип" : "фото";

    if (!productName) {
      console.log(`✗ ${shortName} - товара №${task.productId} нет в базе`);
      skipped++;
      continue;
    }

    if (dry) {
      console.log(`· ${shortName} → ${role} «${productName}» (№${task.productId})`);
      continue;
    }

    const rule = RULES[task.kind];
    const filename = `${randomBytes(16).toString("hex")}.webp`;
    const target = path.join(DEST, filename);

    await sharp(task.file)
      .resize(rule.maxWidth, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: rule.quality, effort: 5 })
      .toFile(target);

    const url = `/api/product-image/${filename}`;

    if (task.kind === "logo") {
      // Логотип один: прежний убираем и из базы, и с диска
      const { rows: old } = await client.query(
        "DELETE FROM product_images WHERE product_id = $1 AND kind = 'logo' RETURNING image_url",
        [task.productId],
      );
      for (const row of old) {
        const name = String(row.image_url).replace("/api/product-image/", "");
        if (/^[0-9a-f]{32}\.(jpg|jpeg|png|webp)$/.test(name)) {
          fs.rmSync(path.join(DEST, name), { force: true });
          replaced++;
        }
      }

      await client.query(
        "INSERT INTO product_images (product_id, image_url, is_main, kind) VALUES ($1, $2, true, 'logo')",
        [task.productId, url],
      );
    } else {
      const { rows: mains } = await client.query(
        "SELECT id FROM product_images WHERE product_id = $1 AND kind <> 'logo' AND is_main LIMIT 1",
        [task.productId],
      );

      await client.query(
        "INSERT INTO product_images (product_id, image_url, is_main, kind) VALUES ($1, $2, $3, 'photo')",
        [task.productId, url, mains.length === 0],
      );
    }

    if (!keep) {
      // Исходник уезжает из рабочей папки: повторный запуск не должен
      // завести вторую такую же картинку. Путь внутри сохраняем - иначе
      // снимок из папки-номера потеряет связь с товаром
      const to = path.join(DONE, path.relative(SRC, task.file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(task.file, fs.existsSync(to) ? `${to}.${Date.now()}` : to);
    }

    const size = fs.statSync(target).size;
    console.log(`✓ ${shortName} → ${role} «${productName}» (${Math.round(size / 1024)} КБ)`);
    added++;
  }

  if (dry) {
    console.log(`\nПробный запуск: перенесётся ${tasks.length - skipped} файлов.`);
  } else {
    console.log(
      `\nПеренесено: ${added}. Заменено логотипов: ${replaced}. Пропущено: ${skipped}.` +
        (keep ? "" : `\nИсходники - в ${path.relative(process.cwd(), DONE)}`),
    );
  }
}

await client.connect();
try {
  await (args.includes("--list") ? list() : importAll());
} finally {
  await client.end();
}
