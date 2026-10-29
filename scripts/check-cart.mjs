/**
 * Проверка правил корзины.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-cart.mjs
 *
 * Корзина лежит в куке, а форма товара - в руках покупателя. Поэтому
 * сервер сам приводит количество к шагу товара, требует ровно одно
 * значение каждой характеристики и не верит id, которые не влезают в
 * integer. Здесь стережём эти правила - без базы, на чистых функциях,
 * которые вызывают и действия корзины, и resolveCart.
 */
import { normalizeQuantity, pickAttributeValues } from "../src/lib/product-price.ts";
import { parseId, MAX_DB_ID } from "../src/lib/ids.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------- количество по шагу

check("подделанное «150» при шаге 100 - 200", normalizeQuantity(150, 100, 100) === 200);
check("1 при минимуме 50 и шаге 24 - 72", normalizeQuantity(1, 50, 24) === 72);
check("шаг 1 - только минимум", normalizeQuantity(3, 10, 1) === 10);
check("отрицательное - минимум", normalizeQuantity(-500, 20, 20) === 20);

// --------------------------------------------- набор характеристик

// Товар: «Бумага» (1) = 11 | 12, «Ламинация» (2) = 21 | 22
const options = [
  { valueId: 11, attributeId: 1 },
  { valueId: 12, attributeId: 1 },
  { valueId: 21, attributeId: 2 },
  { valueId: 22, attributeId: 2 },
];

check("по одному на характеристику - принимается", same(pickAttributeValues([21, 11], options), [11, 21]));
check("два значения одной характеристики - отказ", pickAttributeValues([11, 12, 21], options) === null);
check("пропущенная характеристика - отказ", pickAttributeValues([11], options) === null);
check("ничего не выбрано - отказ", pickAttributeValues([], options) === null);
check(
  "значение чужого товара отбрасывается",
  same(pickAttributeValues([11, 21, 999], options), [11, 21]),
  JSON.stringify(pickAttributeValues([11, 21, 999], options)),
);
check(
  "только чужое значение вместо своей характеристики - отказ",
  pickAttributeValues([11, 999], options) === null,
);
check("повтор того же значения - не второй выбор", same(pickAttributeValues([11, 11, 21], options), [11, 21]));
check("у товара без характеристик - пустой набор", same(pickAttributeValues([], []), []));
check("товар без характеристик, чужие значения - пустой набор", same(pickAttributeValues([5, 6], []), []));

// ----------------------------------------------------------- parseId

check("«7» - 7", parseId("7") === 7);
check("число 7 - 7", parseId(7) === 7);
check("« 7 » с пробелами - 7", parseId(" 7 ") === 7);
check("«1.5» - не id", parseId("1.5") === null);
check("1.5 числом - не id", parseId(1.5) === null);
check("«1e3» - не id", parseId("1e3") === null);
check("«99999999999» - не id", parseId("99999999999") === null);
check("«-1» - не id", parseId("-1") === null);
check("«0» - не id", parseId("0") === null);
check("пустая строка - не id", parseId("") === null);
check("null - не id", parseId(null) === null);
check("«constructor» - не id", parseId("constructor") === null);
check("потолок integer - ещё id", parseId(String(MAX_DB_ID)) === MAX_DB_ID);
check("потолок integer + 1 - не id", parseId(MAX_DB_ID + 1) === null);
check("NaN - не id", parseId(Number.NaN) === null);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
