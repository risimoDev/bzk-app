/**
 * Генерирует CSS-маски рваного края для globals.css.
 *
 *   node scripts/generate-torn-mask.mjs
 *
 * Почему не вручную: плавная синусоида, растянутая на всю ширину экрана,
 * читается как волна, а не как разрыв бумаги. Нужен шум в двух масштабах -
 * мелкие зубцы и редкие глубокие надрывы, - а такой путь руками не написать.
 * Генератор детерминированный: одни и те же семена дают один и тот же край,
 * так что дизайн не «плывёт» между сборками.
 *
 * Вариантов несколько: каждый переход на сайте берёт свой, иначе все стыки
 * рвутся одинаково и повтор бросается в глаза.
 */
import { readFileSync, writeFileSync } from "node:fs";

const W = 2400; // широкая плитка: на большинстве экранов повтора не видно
const H = 46;
const STEP = 7;

/** Длина хвоста, на котором конец плитки сводится с её началом. */
const BLEND = 240;

function tornPath(seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // Периоды заданы целым числом волн на плитку, поэтому синусы
  // повторяются ровно на её границе и стык не «прыгает».
  //
  // Длинные волны здесь недопустимы: период около ширины экрана
  // читается не как разрыв бумаги, а как наклон кромки - у левого
  // края она заметно ниже, чем в середине.
  const n1 = 54 + Math.floor(rnd() * 14); // ~40-45px период
  const n2 = 33 + Math.floor(rnd() * 12); // ~55-70px период
  const phase = rnd() * Math.PI * 2;

  const wave = (x) =>
    Math.sin((2 * Math.PI * n1 * x) / W) * 3.2 +
    Math.sin((2 * Math.PI * n2 * x) / W + phase) * 2.4;

  const raw = [];
  for (let x = 0; x <= W; x += STEP) {
    const small = (rnd() - 0.5) * 5.5;
    // Редкие глубокие зубцы - там, где волокно рвётся неровно
    const spike = rnd() > 0.94 ? (rnd() - 0.5) * 10 : 0;
    raw.push([x, 21 + wave(x) + small + spike]);
  }

  // Шум не периодичен, поэтому хвост плавно сводим к началу:
  // иначе на экране шире плитки виден скачок на её стыке.
  const startY = raw[0][1];
  const pts = raw.map(([x, y]) => {
    if (x > W - BLEND) {
      const t = (x - (W - BLEND)) / BLEND;
      y = y * (1 - t) + startY * t;
    }
    return [x, +y.toFixed(1)];
  });
  pts[pts.length - 1][1] = +startY.toFixed(1);

  const edge = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");

  // Рваный край сверху, заливка снизу
  return `${edge}L${W} ${H}L0 ${H}Z`;
}

function dataUri(path) {
  // preserveAspectRatio='none' обязателен: по умолчанию SVG вписывается
  // в блок маски с сохранением пропорций. Блок 2400×44 при исходнике
  // 2400×46 давал картинку 2295px по центру - и по 52px пустоты у краёв,
  // где рваный край просто пропадал и оставалась прямая линия.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' ` +
    `viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>` +
    `<path d='${path}' fill='%23000'/></svg>`;
  return `data:image/svg+xml,${svg
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23")}`;
}

// По одному варианту на каждый переход в макете
const SEEDS = [20260904, 77712345, 31415926, 60221408, 13370051];

const css = SEEDS.map((seed, i) => {
  const uri = dataUri(tornPath(seed));
  return `@utility torn-${i + 1} {
  margin-top: calc(var(--tear-h) * -1);

  -webkit-mask-image: url("${uri}"), linear-gradient(#000, #000);
  mask-image: url("${uri}"), linear-gradient(#000, #000);
  /* +1px перекрытия: без него между слоями остаётся волосяная щель */
  -webkit-mask-size:
    ${W}px var(--tear-h),
    100% calc(100% - var(--tear-h) + 1px);
  mask-size:
    ${W}px var(--tear-h),
    100% calc(100% - var(--tear-h) + 1px);
  -webkit-mask-position: top left, bottom left;
  mask-position: top left, bottom left;
  -webkit-mask-repeat: repeat-x, no-repeat;
  mask-repeat: repeat-x, no-repeat;

  position: relative;
}`;
}).join("\n\n");

const FILE = "src/app/globals.css";
const source = readFileSync(FILE, "utf8");

const START = "/* === НАЧАЛО: рваные края, генерируются скриптом === */";
const END = "/* === КОНЕЦ: рваные края === */";

if (!source.includes(START)) {
  throw new Error(
    `В ${FILE} нет маркеров генератора. Вставьте туда строки:\n${START}\n${END}`,
  );
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const out = source.replace(
  new RegExp(`${esc(START)}[\\s\\S]*?${esc(END)}`),
  `${START}\n${css}\n${END}`,
);

writeFileSync(FILE, out, "utf8");
console.log(
  `Обновлено ${FILE}: ${SEEDS.length} вариантов края, плитка ${W}×${H}`,
);
