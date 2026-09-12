/**
 * Сверяет перенесённый раскрой со старым PHP-алгоритмом.
 *
 *   node --experimental-strip-types scripts/check-cutting.mjs
 *
 * Прямоугольники должны совпадать в точности. По кругам расхождение
 * ожидаемо: в старом коде большее число рядов доставалось сдвинутым,
 * то есть более узким - при нечётном числе рядов лист недосчитывался.
 */
import { fitRectangles, fitCircles } from "../src/lib/cutting.ts";

/** Прямоугольники по старому коду - логика идентична, для контроля. */
function legacyRect(sw, sh, iw, ih, margin) {
  if (iw <= 0 || ih <= 0 || sw <= 0 || sh <= 0) return 0;
  const w = iw + margin;
  const h = ih + margin;
  const c1 = Math.floor(sw / w) * Math.floor(sh / h);
  const c2 = Math.floor(sw / h) * Math.floor(sh / w);
  return Math.max(c1, c2);
}

/** Круги ровно так, как считал старый PHP. */
function legacyCircle(sw, sh, dia, margin) {
  if (dia <= 0 || sw <= 0 || sh <= 0) return 0;
  const d = dia + margin;
  const grid = Math.floor(sw / d) * Math.floor(sh / d);

  const hexRowHeight = d * 0.866;
  const cols = Math.floor(sw / d);
  const rows = Math.floor(sh / hexRowHeight);
  const colsShifted = Math.floor((sw - d / 2) / d);

  // Здесь и была ошибка: floor достаётся полным рядам, ceil - сдвинутым
  const fullRows = Math.floor(rows / 2);
  const halfRows = Math.ceil(rows / 2);
  const hex = fullRows * cols + halfRows * Math.max(0, colsShifted);

  return Math.max(grid, hex);
}

const sheets = [
  [320, 450], // SRA3
  [1000, 1000],
  [1370, 50000], // рулон
  [700, 1000],
];
const rects = [
  [90, 50, 2], // визитка
  [210, 297, 2], // A4
  [100, 100, 3],
  [148, 210, 2], // A5
  [55, 85, 1],
];
const circles = [
  [50, 2],
  [100, 2],
  [200, 2],
  [38, 2], // значок
  [95, 5],
];

let rectDiff = 0;
let circleDiff = 0;
const examples = [];

for (const [sw, sh] of sheets) {
  for (const [iw, ih, m] of rects) {
    const mine = fitRectangles(sw, sh, iw, ih, m).count;
    const old = legacyRect(sw, sh, iw, ih, m);
    if (mine !== old) {
      rectDiff++;
      examples.push(`ПРЯМОУГОЛЬНИК ${sw}×${sh} / ${iw}×${ih}: новый ${mine}, старый ${old}`);
    }
  }
  for (const [d, m] of circles) {
    const mine = fitCircles(sw, sh, d, m).count;
    const old = legacyCircle(sw, sh, d, m);
    if (mine !== old) {
      circleDiff++;
      examples.push(
        `КРУГ ${sw}×${sh} / ⌀${d}: новый ${mine}, старый ${old} (+${mine - old})`,
      );
    }
  }
}

console.log(`Прямоугольники: расхождений ${rectDiff} из ${sheets.length * rects.length}`);
console.log(`Круги: расхождений ${circleDiff} из ${sheets.length * circles.length}`);
if (examples.length) {
  console.log("\nПримеры:");
  for (const e of examples.slice(0, 8)) console.log("  " + e);
}

// Прямоугольники обязаны совпадать: там логику не меняли
process.exit(rectDiff === 0 ? 0 : 1);
