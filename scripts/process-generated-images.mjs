import sharp from "sharp";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS_DIR = "C:/Users/User/.gemini/antigravity/brain/cb120ab9-fe15-466e-944e-812fa623a331";

const ASSETS = [
  {
    src: join(ARTIFACTS_DIR, "patch_bzk_embroidered_1788762205472.jpg"),
    destName: "patch-bzk",
    type: "cutout",
    threshold: 242,
    feather: 10,
  },
  {
    src: join(ARTIFACTS_DIR, "merch_mug_ruble_1788762185641.jpg"),
    destName: "merch-mug",
    type: "cutout",
    threshold: 246,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "merch_usb_bzk_1788762221695.jpg"),
    destName: "merch-usb",
    type: "cutout",
    threshold: 244,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "merch_keychain_ruble_1788762241395.jpg"),
    destName: "merch-keychain",
    type: "cutout",
    threshold: 245,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "merch_boxes_qr_1788762257572.jpg"),
    destName: "merch-boxes",
    type: "cutout",
    threshold: 246,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "collage_corner_elements_1788762280841.jpg"),
    destName: "scrap-corner-money",
    type: "cutout",
    threshold: 245,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "torn_paper_sheet_1788762333899.jpg"),
    destName: "torn-sheet-bone",
    type: "cutout",
    threshold: 248,
    feather: 8,
  },
  {
    src: join(ARTIFACTS_DIR, "bg_dark_crumpled_paper_1788762300572.jpg"),
    destName: "paper-dark-kraft",
    type: "background",
  },
];

mkdirSync("assets-src/collage", { recursive: true });
mkdirSync("assets-src/bg", { recursive: true });
mkdirSync("public/collage", { recursive: true });
mkdirSync("public/bg", { recursive: true });

async function removeWhiteBg(inputPath, threshold = 245, feather = 8) {
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  // Flood-fill or corner-based white transparency removal
  // For each pixel, compute luminance or max(r,g,b)
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Check if pixel is near pure white background
    const minVal = Math.min(r, g, b);
    const maxVal = Math.max(r, g, b);
    const diff = maxVal - minVal;

    // Background is neutral white (low saturation, high brightness)
    if (diff < 15 && minVal >= threshold - feather) {
      if (minVal >= threshold) {
        data[i + 3] = 0; // completely transparent
      } else {
        // smooth feather
        const factor = (threshold - minVal) / feather;
        data[i + 3] = Math.round(255 * factor);
      }
    }
  }

  return sharp(data, { raw: { width, height, channels } });
}

console.log("Обработка сгенерированных изображений...");

for (const item of ASSETS) {
  if (!existsSync(item.src)) {
    console.warn(`Файл не найден: ${item.src}`);
    continue;
  }

  if (item.type === "background") {
    // Сохраняем фон в assets-src и public
    const destJpg = join("assets-src/bg", `${item.destName}.jpg`);
    const destWebp = join("public/bg", `${item.destName}.webp`);
    copyFileSync(item.src, destJpg);

    await sharp(item.src)
      .resize(2000, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(destWebp);

    console.log(`✓ Фон сохранён: ${destWebp}`);
  } else if (item.type === "cutout") {
    const destPng = join("assets-src/collage", `${item.destName}.png`);
    const destWebp = join("public/collage", `${item.destName}.webp`);
    const destPublicPng = join("public/collage", `${item.destName}.png`);

    // Удаляем белый фон и обрезаем пустые поля
    const transparentImg = await removeWhiteBg(item.src, item.threshold, item.feather);

    // Сохраняем PNG в assets-src
    await transparentImg
      .trim({ threshold: 10 })
      .png({ compressionLevel: 9 })
      .toFile(destPng);

    // Сохраняем оптимизированный WebP и PNG в public/
    await sharp(destPng)
      .resize(1200, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 5 })
      .toFile(destWebp);

    await sharp(destPng)
      .resize(1200, null, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toFile(destPublicPng);

    console.log(`✓ Вырезка готова (PNG + WebP): ${item.destName}`);
  }
}

console.log("Готово! Все ассеты обработаны.");
