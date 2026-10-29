/**
 * Проверка цены за тираж.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-price.mjs
 *
 * Формула одна на корзину и на карточку товара: сумму, которую человек
 * видит до «В корзину», считает браузер, а ту, по которой оформляется
 * заказ, - сервер. Разойдись они хоть на копейку, клиент увидит в
 * корзине не ту цену, что в карточке. Здесь стережём само правило:
 * ступени, надбавки и округление количества.
 */
import { tierFor, unitPriceFor, normalizeQuantity, fromUnitPrice } from "../src/lib/product-price.ts";
import { readFileSync } from "node:fs";
import { nextTierUpsell, catalogTierOptions } from "../src/lib/tier-upsell.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const tiers = [
  { minQty: 100, maxQty: 499, price: "5.00" },
  { minQty: 500, maxQty: 999, price: "4.00" },
  { minQty: 1000, maxQty: null, price: "3.20" },
];
const base = "6.50";
const price = (quantity, surcharge = 0) => unitPriceFor({ basePrice: base, tiers, quantity, surcharge });

// ---------------------------------------------------------- ступени

check("ниже первой ступени - базовая цена", price(50) === 6.5, String(price(50)));
check("ровно на границе ступени - её цена", price(100) === 5, String(price(100)));
check("верх диапазона ещё в ступени", price(499) === 5, String(price(499)));
check("следующая ступень со своей границы", price(500) === 4, String(price(500)));
check("открытая сверху ступень", price(50_000) === 3.2, String(price(50_000)));
check("без ступеней - базовая цена", unitPriceFor({ basePrice: "7", tiers: [], quantity: 10 }) === 7);

// Пересечение диапазонов: так цены лежат в базе со старого сайта, и
// выигрывает последняя подходящая - более крупный тираж
const overlapping = [
  { minQty: 1, maxQty: 1000, price: "10" },
  { minQty: 100, maxQty: null, price: "8" },
];
check(
  "при пересечении берётся последняя ступень",
  tierFor(overlapping, 500)?.price === "8",
  String(tierFor(overlapping, 500)?.price),
);

// ---------------------------------------------------------- надбавки

check("надбавка прибавляется к цене ступени", price(500, 1.5) === 5.5, String(price(500, 1.5)));
check("скидка вычитается", price(500, -0.5) === 3.5, String(price(500, -0.5)));
check("цена не уходит в минус", price(1000, -100) === 0, String(price(1000, -100)));

// ------------------------------------------------------ количество

check("кратность округляет вверх", normalizeQuantity(150, 100, 100) === 200);
check("кратное остаётся как есть", normalizeQuantity(300, 100, 100) === 300);
check("меньше минимума - минимум", normalizeQuantity(10, 50, 1) === 50);
check("пустое поле - минимум", normalizeQuantity(Number(""), 50, 1) === 50);
check("не число - минимум", normalizeQuantity(Number.NaN, 50, 1) === 50);
check("дробь отбрасывается", normalizeQuantity(120.9, 100, 1) === 120);
check("кратность 0 не ломает расчёт", normalizeQuantity(7, 1, 0) === 7);

// ------------------------------------------------------ цена «от»
// Витрина показывает цену за единицу при минимальном тираже, а не базовую:
// тот же расчёт, что у корзины на первой же строке

const from = (minQuantity, multiplicity = 1, t = tiers) =>
  fromUnitPrice({ basePrice: base, tiers: t, minQuantity, multiplicity });

check("«от»: минимум совпал со ступенью - её цена", from(100) === 5, String(from(100)));
check("«от»: минимум ниже первой ступени - базовая", from(50) === 6.5, String(from(50)));
check("«от»: кратность поднимает тираж до ступени", from(60, 50) === 5, String(from(60, 50)));
check("«от»: без ступеней - базовая", from(10, 1, []) === 6.5);
check("«от»: ступени в любом порядке", from(500, 1, [...tiers].reverse()) === 4);
check(
  "«от» равна цене первой строки корзины",
  from(100) === unitPriceFor({ basePrice: base, tiers, quantity: normalizeQuantity(100, 100, 1) }),
);

// ------------------------------------------- подсказка про тираж
// «Возьмите больше - дешевле за штуку»: цены те же, что у корзины, поэтому
// сумма в подсказке равна строке корзины на том тираже

const upsell = (quantity, extra = {}) =>
  nextTierUpsell({ basePrice: base, tiers, quantity, minQuantity: 100, multiplicity: 1, ...extra });

const u1 = upsell(100);
check("подсказка: со ступени 100 зовёт на 500", u1?.nextQty === 500, JSON.stringify(u1));
check("подсказка: сейчас 100 шт. по 5 = 500", u1?.currentTotal === 500 && u1?.currentUnit === 5);
check("подсказка: 500 шт. по 4 = 2000, доплата 1500", u1?.nextTotal === 2000 && u1?.extra === 1500);
check("подсказка: экономия считается по цене за штуку (20%)", u1?.savingPercent === 20, String(u1?.savingPercent));
check(
  "подсказка: сумма следующего тиража равна строке корзины",
  u1?.nextTotal === unitPriceFor({ basePrice: base, tiers, quantity: 500 }) * 500,
);
check("подсказка: из середины ступени - всё равно следующая", upsell(300)?.nextQty === 500);
check("подсказка: на последней ступени её нет", upsell(1000) === null);
check("подсказка: выше последней ступени её нет", upsell(5000) === null);
check("подсказка: без ступеней её нет", nextTierUpsell({ basePrice: base, tiers: [], quantity: 10, minQuantity: 1, multiplicity: 1 }) === null);

// Ступень не дешевле не считается: она не довод брать больше
const flat = [
  { minQty: 100, maxQty: 499, price: "5" },
  { minQty: 500, maxQty: 999, price: "5" },
  { minQty: 1000, maxQty: null, price: "4" },
];
const uf = nextTierUpsell({ basePrice: "5", tiers: flat, quantity: 100, minQuantity: 100, multiplicity: 1 });
check("подсказка: ступень с той же ценой пропускается", uf?.nextQty === 1000, String(uf?.nextQty));
const worse = [
  { minQty: 100, maxQty: 499, price: "5" },
  { minQty: 500, maxQty: null, price: "6" },
];
check(
  "подсказка: более дорогая ступень не предлагается",
  nextTierUpsell({ basePrice: "5", tiers: worse, quantity: 100, minQuantity: 100, multiplicity: 1 }) === null,
);

// Кратность: тираж ступени подгоняется, и цена считается на подогнанном
const um = nextTierUpsell({ basePrice: base, tiers, quantity: 100, minQuantity: 100, multiplicity: 150 });
check("подсказка: тираж кратен шагу", um?.nextQty === 600 && um?.currentQty === 150, JSON.stringify(um));
check("подсказка: цена на подогнанном тираже", um?.nextUnit === 4);

// Надбавка характеристики за штуку - как в корзине
const us = upsell(100, { surcharge: 1 });
check("подсказка: надбавка входит в обе цены", us?.currentUnit === 6 && us?.nextUnit === 5, JSON.stringify(us));
check("подсказка: процент считается от цены с надбавкой", us?.savingPercent === 16, String(us?.savingPercent));

// Проценты округляются вниз и не показываются, если меньше единицы
const tiny = nextTierUpsell({
  basePrice: "1000",
  tiers: [{ minQty: 10, maxQty: null, price: "999.5" }],
  quantity: 1,
  minQuantity: 1,
  multiplicity: 1,
});
check("подсказка: меньше процента - без процента", tiny !== null && tiny.savingPercent === null, JSON.stringify(tiny));
const nine = nextTierUpsell({
  basePrice: "100",
  tiers: [{ minQty: 10, maxQty: null, price: "90.1" }],
  quantity: 1,
  minQuantity: 1,
  multiplicity: 1,
});
check("подсказка: 9,9% округляется вниз до 9", nine?.savingPercent === 9, String(nine?.savingPercent));

// Крутая скидка: тираж дороже по цене за штуку, но дешевле по сумме
const steep = [
  { minQty: 100, maxQty: 499, price: "5" },
  { minQty: 500, maxQty: null, price: "0.5" },
];
const ust = nextTierUpsell({ basePrice: "5", tiers: steep, quantity: 499, minQuantity: 100, multiplicity: 1 });
check("подсказка: бывает дешевле по сумме (доплата < 0)", ust !== null && ust.extra < 0, JSON.stringify(ust));

// ------------------------------------------- тиражи на карточке

const opts = (extra = {}) => catalogTierOptions({ basePrice: base, tiers, minQuantity: 100, multiplicity: 1, ...extra });
check(
  "каталог: минимальный тираж и ступени",
  JSON.stringify(opts().map((o) => o.quantity)) === "[100,500,1000]",
  JSON.stringify(opts().map((o) => o.quantity)),
);
check("каталог: цена и сумма тиража как в корзине", opts()[1].unitPrice === 4 && opts()[1].total === 2000);
check("каталог: не больше трёх", opts({ limit: 3 }).length <= 3);
const many = [1, 2, 3, 4, 5, 6].map((i) => ({ minQty: i * 100, maxQty: i === 6 ? null : i * 100 + 99, price: String(10 - i) }));
const om = catalogTierOptions({ basePrice: "10", tiers: many, minQuantity: 50, multiplicity: 1 });
check(
  "каталог: из многих ступеней - первый, средний, последний",
  om.length === 3 && om[0].quantity === 50 && om[2].quantity === 600,
  JSON.stringify(om.map((o) => o.quantity)),
);
check(
  "каталог: тираж ступени совпал с минимумом - без повтора",
  opts().filter((o) => o.quantity === 100).length === 1,
);
check(
  "каталог: ступень с той же ценой не даёт кнопку",
  JSON.stringify(catalogTierOptions({ basePrice: "5", tiers: flat, minQuantity: 100, multiplicity: 1 }).map((o) => o.quantity)) === "[100,1000]",
);
check(
  "каталог: тираж подгоняется под кратность",
  catalogTierOptions({ basePrice: base, tiers, minQuantity: 100, multiplicity: 150 })[0].quantity === 150,
);
check(
  "каталог: без ступеней - только минимальный тираж",
  catalogTierOptions({ basePrice: "7", tiers: [], minQuantity: 10, multiplicity: 1 }).length === 1,
);
check("каталог: первый тираж равен цене «от»", opts()[0].unitPrice === from(100));

// ------------------------------------------- форма на карточке (по коду)
// Правила, которые легко сломать правкой вёрстки

const formSrc = readFileSync(new URL("../src/components/catalog/AddToCartForm.tsx", import.meta.url), "utf8");
check("форма: характеристики остались настоящими radio", formSrc.includes('type="radio"'));
check("форма: плавающая панель отправляет ту же форму", formSrc.includes("requestSubmit()"));
check("форма: плавающая панель только на телефоне", /fixed[^"`]*md:hidden/.test(formSrc));
check("форма: количество и шаг в форму не кладутся (берёт сервер)", !/name="(minQuantity|multiplicity)"/.test(formSrc));

console.log(failed === 0 ?"\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
