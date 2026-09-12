/**
 * Готовит картинки к вебу: обрезает пустые поля у вырезок, ужимает размер
 * и пережимает в WebP.
 *
 *   node scripts/optimize-assets.mjs
 *
 * Читает оригиналы из assets-src/, пишет результат в public/.
 * Оригиналы не трогает - их можно перегенерировать в любой момент.
 *
 * Зачем вообще: фоны подключаются через CSS background-image, а такие
 * файлы Next.js не оптимизирует - браузер качает ровно то, что лежит
 * в public/. Исходники по 3.6 МБ на обложке недопустимы.
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname, basename } from "node:path";

const SRC = "assets-src";
const DEST = "public";

/** Правила по папкам: во что упираемся по ширине и с каким качеством жмём. */
const RULES = {
  bg: { maxWidth: 2000, quality: 78, trim: false },
  production: { maxWidth: 1600, quality: 76, trim: false },
  collage: { maxWidth: 1400, quality: 82, trim: true },
  // products/ здесь намеренно нет: картинки товаров привязаны к записям
  // в базе и уезжают в хранилище, а не в public. Их переносит
  // scripts/import-product-images.mjs
};

if (!existsSync(SRC)) {
  console.error(`Нет папки ${SRC}/ - положите туда оригиналы.`);
  process.exit(1);
}

const IMG = [".png", ".jpg", ".jpeg", ".jfif", ".webp"];
let totalBefore = 0;
let totalAfter = 0;
const rows = [];

for (const dir of readdirSync(SRC, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;

  const rule = RULES[dir.name];
  if (!rule) {
    console.log(`Пропускаю ${dir.name}/ - нет правила обработки`);
    continue;
  }

  const outDir = join(DEST, dir.name);
  mkdirSync(outDir, { recursive: true });

  for (const file of readdirSync(join(SRC, dir.name))) {
    if (!IMG.includes(extname(file).toLowerCase())) continue;

    const from = join(SRC, dir.name, file);
    const name = basename(file, extname(file));
    const to = join(outDir, `${name}.webp`);

    const before = statSync(from).size;

    let img = sharp(from);
    const meta = await img.metadata();

    // У вырезок вокруг объекта остаётся огромное пустое поле:
    // росчерк занимает десятую часть холста, а весит как весь холст.
    //
    // Порог именно 12, а не 1: после обтравки у краёв остаётся мягкий
    // полупрозрачный ореол, и слишком чувствительный trim считает его
    // содержимым - обрезка тогда почти ничего не даёт.
    if (rule.trim && meta.hasAlpha) {
      img = img.trim({ threshold: 12 });
    }

    img = img.resize(rule.maxWidth, null, {
      fit: "inside",
      withoutEnlargement: true,
    });

    await img.webp({ quality: rule.quality, effort: 5 }).toFile(to);

    const after = statSync(to).size;
    const out = await sharp(to).metadata();

    totalBefore += before;
    totalAfter += after;
    rows.push({
      name: `${dir.name}/${name}.webp`,
      from: `${meta.width}×${meta.height}`,
      to: `${out.width}×${out.height}`,
      before,
      after,
    });
  }
}

rows.sort((a, b) => a.name.localeCompare(b.name));

console.log(
  "Файл".padEnd(38) + "Было".padStart(12) + "Стало".padStart(12) + "Вес".padStart(16),
);
console.log("-".repeat(80));
for (const r of rows) {
  const pct = Math.round((1 - r.after / r.before) * 100);
  console.log(
    r.name.padEnd(38) +
      r.from.padStart(12) +
      r.to.padStart(12) +
      `${Math.round(r.before / 1024)}K → ${Math.round(r.after / 1024)}K`.padStart(14) +
      ` −${pct}%`,
  );
}
console.log("-".repeat(80));
console.log(
  `Итого: ${(totalBefore / 1048576).toFixed(1)} МБ → ${(totalAfter / 1048576).toFixed(1)} МБ ` +
    `(−${Math.round((1 - totalAfter / totalBefore) * 100)}%)`,
);

// ---------------------------------------------------------------- манифест

/**
 * Размеры нужны в разметке заранее: без них браузер не знает, сколько
 * места займёт картинка, и вёрстка прыгает в момент загрузки.
 */
const manifest = {};
for (const r of rows) {
  const [dir, file] = r.name.split("/");
  const key = basename(file, ".webp");
  const [w, h] = r.to.split("×").map(Number);
  (manifest[dir] ??= {})[key] = { src: `/${r.name}`, width: w, height: h };
}

const ts = [
  "/**",
  " * Размеры оптимизированных картинок.",
  " *",
  " * Сгенерировано: scripts/optimize-assets.mjs - руками не править.",
  " */",
  "",
  "export type Asset = { src: string; width: number; height: number };",
  "",
];

for (const [dir, entries] of Object.entries(manifest)) {
  const varName = dir.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  ts.push(`export const ${varName} = {`);
  for (const [key, v] of Object.entries(entries)) {
    const prop = /^[a-z][a-z0-9]*$/i.test(key) ? key : JSON.stringify(key);
    ts.push(
      `  ${prop}: { src: "${v.src}", width: ${v.width}, height: ${v.height} },`,
    );
  }
  ts.push(`} as const satisfies Record<string, Asset>;`, "");
}

writeFileSync("src/lib/assets.ts", ts.join("\n"), "utf8");
console.log(`Манифест: src/lib/assets.ts (${rows.length} картинок)`);
