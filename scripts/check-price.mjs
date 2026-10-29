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

console.log(failed === 0 ?"\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
