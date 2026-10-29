/**
 * Проверка разбора атрибутов позиции заказа.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-order-attributes.mjs
 *
 * В базе два формата: массив от оформления и объект с перенесённых
 * заказов. Админка когда-то разбирала только объект и печатала
 * «0: [object Object]».
 */
import { parseOrderAttributes, formatOrderAttribute } from "../src/lib/order-attributes.ts";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}
const nb = (s) => s.replace(/[  ]/g, " ");
const line = (raw) => parseOrderAttributes(raw).map((a) => nb(formatOrderAttribute(a)));

check(
  "массив: без надбавки",
  JSON.stringify(line([{ attribute: "Цвет внутри", value: "Белый", modifier: 0 }])) ===
    JSON.stringify(["Цвет внутри: Белый"]),
);
check(
  "массив: с надбавкой",
  JSON.stringify(line([{ attribute: "Материал", value: "Лён", modifier: 3 }])) ===
    JSON.stringify(["Материал: Лён (+3,00 ₽)"]),
  line([{ attribute: "Материал", value: "Лён", modifier: 3 }]).join(),
);
check(
  "массив: скидка за вариант",
  line([{ attribute: "Бумага", value: "Офсет", modifier: -1.5 }])[0] === "Бумага: Офсет (−1,50 ₽)",
);
check(
  "старый объект",
  JSON.stringify(line({ Размер: "A4", Цвет: "Синий" })) ===
    JSON.stringify(["Размер: A4", "Цвет: Синий"]),
);
check("пустой массив", line([]).length === 0);
check("null и мусор", line(null).length === 0 && line("x").length === 0 && line(5).length === 0);
check("битые элементы пропускаются", line([null, 3, { attribute: "", value: "" }]).length === 0);
check("надбавка строкой из базы", line([{ attribute: "A", value: "B", modifier: "2.5" }])[0] === "A: B (+2,50 ₽)");

if (failed > 0) {
  console.error(`\nПровалено: ${failed}`);
  process.exit(1);
}
console.log("\nВсё в порядке");
