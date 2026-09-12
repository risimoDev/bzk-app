/**
 * Переносит текст правовых страниц из старого PHP в структуру для нового сайта.
 *
 *   node scripts/extract-legal.mjs
 *
 * Юридический текст нельзя пересказывать своими словами, поэтому он
 * вытаскивается из разметки как есть: заголовки, абзацы и списки - без
 * правок формулировок. Меняется только оформление.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SOURCES = [
  { file: "../privacy.php", name: "privacy", title: "Политика конфиденциальности" },
  { file: "../terms.php", name: "terms", title: "Условия использования" },
];

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Убирает вложенные теги, оставляя чистый текст. */
const strip = (html) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const out = [];

for (const src of SOURCES) {
  // Путь от корня проекта (bzk-app), а не от папки скрипта
  const raw = readFileSync(src.file, "utf8");

  // Берём только тело страницы: до подключения футера
  const body = raw.split("require_once 'includes/footer.php'")[0];

  /** @type {{type:string, text?:string, items?:string[]}[]} */
  const blocks = [];

  // Заголовки, абзацы и списки в порядке появления
  const re = /<(h2|h3|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of body.matchAll(re)) {
    const tag = m[1].toLowerCase();
    const inner = m[2];

    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => strip(li[1]))
        .filter((t) => t.length > 2);
      if (items.length) blocks.push({ type: "list", items });
      continue;
    }

    const text = strip(inner);
    // Пустые заголовки в старой вёрстке - это обёртки вокруг иконок
    if (text.length < 3) continue;
    // Служебные подписи вроде «Последнее обновление» не нужны
    if (/^последнее обновление/i.test(text)) continue;

    blocks.push({ type: tag === "p" ? "p" : "h", text });
  }

  out.push({ ...src, blocks });
  console.log(`${src.name}: блоков ${blocks.length}`);
}

mkdirSync("src/lib/content", { recursive: true });

const ts = `/**
 * Тексты правовых страниц.
 *
 * Сгенерировано: scripts/extract-legal.mjs из privacy.php и terms.php
 * старого сайта. Формулировки перенесены дословно - юридический текст
 * править нельзя, только оформление.
 */

export type LegalBlock =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; items: string[] };

export type LegalDoc = { title: string; blocks: LegalBlock[] };

${out
  .map(
    (d) =>
      `export const ${d.name}: LegalDoc = ${JSON.stringify(
        { title: d.title, blocks: d.blocks },
        null,
        2,
      )};`,
  )
  .join("\n\n")}
`;

writeFileSync("src/lib/content/legal.ts", ts, "utf8");
console.log("Записано: src/lib/content/legal.ts");
