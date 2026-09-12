/**
 * Проверка загруженных картинок: размер в пикселях, реальная прозрачность, вес.
 * Читает заголовки файлов напрямую, без зависимостей.
 *
 *   node scripts/audit-assets.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { inflateSync } from "node:zlib";

const ROOT = "public";

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Настоящий ли формат файла - расширение может врать (.jfif это JPEG). */
function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP")
    return "webp";
  if (buf.slice(0, 5).toString() === "<?xml" || buf.slice(0, 4).toString() === "<svg")
    return "svg";
  return "?";
}

function pngInfo(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  // 6 = RGBA, 4 = Gray+A, 3 = палитра (прозрачность через tRNS)
  const canHaveAlpha = colorType === 6 || colorType === 4 || colorType === 3;

  let usesAlpha = null;
  if (colorType === 6 && bitDepth === 8) {
    // Собираем IDAT и смотрим, есть ли хоть один непрозрачный-не-до-конца пиксель
    const chunks = [];
    let off = 8;
    while (off < buf.length - 8) {
      const len = buf.readUInt32BE(off);
      const type = buf.slice(off + 4, off + 8).toString("latin1");
      if (type === "IDAT") chunks.push(buf.slice(off + 8, off + 8 + len));
      if (type === "IEND") break;
      off += 12 + len;
    }
    try {
      const raw = inflateSync(Buffer.concat(chunks));
      const stride = width * 4 + 1; // +1 байт фильтра на строку
      let transparent = 0;
      let sampled = 0;
      // Пробуем каждую 7-ю строку - этого хватает, чтобы поймать фон
      for (let y = 0; y < height; y += 7) {
        const rowStart = y * stride + 1;
        if (rowStart + width * 4 > raw.length) break;
        for (let x = 0; x < width; x += 7) {
          const a = raw[rowStart + x * 4 + 3];
          sampled++;
          if (a < 250) transparent++;
        }
      }
      usesAlpha = sampled ? transparent / sampled : 0;
    } catch {
      usesAlpha = null; // чересстрочный или нестандартный PNG
    }
  }

  return { width, height, colorType, canHaveAlpha, usesAlpha };
}

function jpegInfo(buf) {
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    // SOF0..SOF15, кроме DHT/JPG/DAC
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + buf.readUInt16BE(off + 2);
  }
  return { width: 0, height: 0 };
}

const files = walk(ROOT).filter((f) =>
  [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".svg"].includes(extname(f).toLowerCase()),
);

const rows = [];
for (const f of files) {
  const buf = readFileSync(f);
  const bytes = statSync(f).size;
  const real = sniff(buf);
  const ext = extname(f).toLowerCase().slice(1);

  let w = 0, h = 0, alpha = "-", notes = [];

  if (real === "png") {
    const i = pngInfo(buf);
    w = i.width;
    h = i.height;
    if (!i.canHaveAlpha) {
      alpha = "НЕТ";
      notes.push("PNG без альфа-канала");
    } else if (i.usesAlpha === null) {
      alpha = "есть?";
    } else if (i.usesAlpha < 0.01) {
      alpha = "не исп.";
      notes.push("альфа есть, но фон непрозрачный");
    } else {
      alpha = `${Math.round(i.usesAlpha * 100)}%`;
    }
  } else if (real === "jpeg") {
    const i = jpegInfo(buf);
    w = i.width;
    h = i.height;
    alpha = "НЕТ";
    if (ext === "jfif") notes.push("это JPEG с расширением .jfif");
  }

  if (bytes > 900_000) notes.push(`тяжёлый: ${(bytes / 1_048_576).toFixed(1)} МБ`);
  if (w && w < 1200 && !f.includes("collage")) notes.push("маловат для фона");

  rows.push({ f: f.replace(/\\/g, "/"), real, w, h, bytes, alpha, notes });
}

rows.sort((a, b) => a.f.localeCompare(b.f));

console.log(
  "Файл".padEnd(52) +
    "Формат".padEnd(8) +
    "Размер".padStart(12) +
    "Вес".padStart(9) +
    "  Альфа".padEnd(10) +
    "Замечания",
);
console.log("-".repeat(130));

for (const r of rows) {
  console.log(
    r.f.padEnd(52) +
      r.real.padEnd(8) +
      `${r.w}×${r.h}`.padStart(12) +
      `${Math.round(r.bytes / 1024)}K`.padStart(9) +
      "  " + r.alpha.padEnd(8) +
      r.notes.join("; "),
  );
}

const total = rows.reduce((n, r) => n + r.bytes, 0);
console.log("-".repeat(130));
console.log(`Файлов: ${rows.length}, суммарный вес: ${(total / 1_048_576).toFixed(1)} МБ`);
