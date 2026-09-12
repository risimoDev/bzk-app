/**
 * Проверка редиректов со старых адресов.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-redirects.mjs
 *
 * Ловит три вида поломок, которые вручную не видны:
 *   1. правило ведёт на страницу, которой нет (или которую переименовали);
 *   2. правило перехватывает адрес нового сайта - тогда живая страница
 *      подменяется редиректом и открыть её нельзя;
 *   3. правило совпадает со своим же назначением - это вечный редирект,
 *      браузер показывает ERR_TOO_MANY_REDIRECTS.
 */
import fs from "node:fs";
import path from "node:path";
// Берём тот же разбор путей, что и сам Next, - иначе проверка спорила бы
// с настоящим поведением. Пакет собран под CommonJS, отсюда и форма импорта
import pathToRegexpPkg from "next/dist/compiled/path-to-regexp/index.js";

const { pathToRegexp } = pathToRegexpPkg;

const { legacyRedirects, legacyRewrites } = await import("../src/lib/redirects.ts");

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) {
    console.log(`✗ ${name}${detail ? " - " + detail : ""}`);
    failed++;
  }
  return ok;
};

// ------------------------------------------------- маршруты нового сайта

const APP = new URL("../src/app/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Все маршруты приложения в виде путей: /catalog, /admin/orders/[id]. */
function routes(dir = APP, prefix = "") {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      if (/^(page|route)\.(tsx|ts)$/.test(entry.name)) found.push(prefix || "/");
      continue;
    }
    if (!entry.isDirectory()) continue;

    // Группы (site) в адрес не попадают
    const segment = /^\(.+\)$/.test(entry.name) ? "" : `/${entry.name}`;
    found.push(...routes(path.join(dir, entry.name), prefix + segment));
  }
  return found;
}

const all = routes();
check("маршруты нашлись", all.length > 20, `найдено ${all.length}`);

/** Совпадает ли конкретный путь с маршрутом приложения. */
function resolves(url) {
  const parts = url.split("/").filter(Boolean);
  return all.some((route) => {
    const seg = route.split("/").filter(Boolean);
    if (seg.length !== parts.length) return false;
    return seg.every((s, i) => (s.startsWith("[") ? parts[i].length > 0 : s === parts[i]));
  });
}

// Подставляем номер вместо параметра: /catalog/:legacyId → /catalog/7
const sample = (dest) => dest.replaceAll(/:[A-Za-z]+/g, "7");

// -------------------------------------------------------- сами правила

const seen = new Set();

for (const rule of [...legacyRedirects, ...legacyRewrites]) {
  const { source, destination } = rule;

  check(`назначение ${source} → ${destination}`, resolves(sample(destination)), "нет такой страницы");

  check(`правило ${source} не задвоено`, !seen.has(source + (rule.has?.[0]?.key ?? "")));
  seen.add(source + (rule.has?.[0]?.key ?? ""));

  const re = pathToRegexp(source);

  // Вечный редирект: правило ловит собственное назначение. С условием на
  // строку запроса это не страшно - после перехода её уже нет
  if (!rule.has) {
    check(`${source} не зацикливается`, !re.test(sample(destination)), `ловит ${destination}`);
  }

  // Правило не должно перехватывать живые страницы нового сайта
  for (const route of all) {
    const live = route.replaceAll(/\[\.\.\.[^\]]+\]/g, "x").replaceAll(/\[[^\]]+\]/g, "7");
    if (re.test(live) && live !== sample(destination)) {
      check(`${source} не трогает живое`, false, `перехватывает ${route}`);
    }
  }
}

// ------------------------------------------------- обязательные адреса

/** Что должно работать после переключения: адреса из старой карты сайта. */
const SITEMAP = [
  ["/payment_delivery", "/payment-delivery"],
  ["/about.php", "/about"],
  ["/catalog.php", "/catalog"],
  ["/index.php", "/"],
  ["/client/mini_warehouse", "/client/warehouse"],
];

for (const [from, expected] of SITEMAP) {
  const rule = legacyRedirects.find((r) => !r.has && pathToRegexp(r.source).test(from));
  check(`${from} ведёт на ${expected}`, rule?.destination === expected, rule?.destination ?? "правила нет");
}

// Вебхук телеграма подменяется, а не редиректится: на 301 телеграм
// повторил бы POST как GET и потерял тело
for (const r of legacyRewrites) {
  check(`${r.source} - подмена`, r.destination === "/api/telegram/webhook");
}

console.log(
  failed === 0
    ? `Все проверки прошли: правил ${legacyRedirects.length + legacyRewrites.length}, маршрутов ${all.length}.`
    : `\nОшибок: ${failed}`,
);
process.exitCode = failed === 0 ? 0 : 1;
