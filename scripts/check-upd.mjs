/**
 * Проверки строк УПД и счёта: скидка по строкам, снимок заказа.
 *
 *   npm run check:upd
 *
 * Чистая арифметика, без базы. Главное, что здесь ловится:
 *  - сумма строк равна итогу документа до копейки;
 *  - цен и сумм меньше нуля нет (раньше скидка шла отрицательной строкой
 *    «Корректировка стоимости»);
 *  - копеечный остаток от деления скидки уходит в последнюю строку.
 */
import { distributeDiscount, settleRows, unitPriceOf } from "../src/lib/upd-rows.ts";
import { buyerSnapshot, itemSnapshotName } from "../src/lib/order-snapshot.ts";
import { parseContact } from "../src/lib/order-contact.ts";

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

/** Сумма в копейках целым числом - чтобы сравнивать без плавающей точки. */
const kop = (list) => list.reduce((s, v) => s + Math.round(v * 100), 0);
const row = (quantity, sum) => ({ quantity, sum, price: quantity ? sum / quantity : 0 });

// ---- скидка делится пропорционально
{
  const out = distributeDiscount([600, 400], 900);
  check("скидка 100 из 1000 делится 60/40", out[0] === 540 && out[1] === 360, out.join(", "));
}

// ---- остаток копеек - в последнюю строку
{
  // Скидка 1,00 на три равные строки: по 0,33, остаток 0,01 в последней
  const out = distributeDiscount([100, 100, 100], 299);
  check("сумма после скидки равна итогу", kop(out) === 29900, out.join(", "));
  check("остаток копейки ушёл в последнюю строку", out[0] === 99.67 && out[1] === 99.67 && out[2] === 99.66, out.join(", "));
}

// ---- сумма сходится на «неудобных» числах
{
  let bad = 0;
  let negative = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    // Детерминированный набор: от 1 до 9 строк, суммы с копейками
    const n = (seed % 9) + 1;
    const sums = Array.from({ length: n }, (_, i) => ((seed * 7919 + i * 104729) % 9_999_999) / 100 + 0.01);
    const total = kop(sums);
    const target = Math.round(total * (((seed * 31) % 97) / 100)) / 100;
    const out = distributeDiscount(sums, target);
    if (kop(out) !== Math.round(target * 100)) bad++;
    if (out.some((v) => v < 0)) negative++;
  }
  check("2000 наборов: сумма строк равна итогу до копейки", bad === 0, `расхождений ${bad}`);
  check("2000 наборов: отрицательных сумм нет", negative === 0, `отрицательных ${negative}`);
}

// ---- крайние случаи
{
  check("итог ноль - все строки обнулены", distributeDiscount([10, 20], 0).every((v) => v === 0));
  check("итог не меньше суммы - строки не тронуты", distributeDiscount([10, 20], 30).join() === "10,20");
  check("пустые строки не падают", distributeDiscount([], 0).length === 0);
  check("нулевая последняя строка не уходит в минус", distributeDiscount([100, 0], 40).join() === "40,0");
  // Последняя строка в одну копейку не может принять остаток - он уходит в предыдущие
  const tiny = distributeDiscount([1000, 1000, 0.01], 1000.5);
  check("крошечная последняя строка: сумма сошлась", kop(tiny) === 100050, tiny.join(", "));
  check("крошечная последняя строка: минусов нет", tiny.every((v) => v >= 0), tiny.join(", "));
}

// ---- settleRows: скидка уходит в строки, наценка остаётся строкой
{
  const rows = [row(10, 500), row(5, 300), row(1, 200)];

  const withPromo = settleRows(rows, 900);
  check("скидка: строки сходятся с итогом", kop(withPromo.rows.map((r) => r.sum)) === 90000);
  check("скидка: итог строк = total", Math.round(withPromo.total * 100) === 90000);
  check("скидка: наценки нет", withPromo.extra === 0);
  check("скидка: размер скидки верный", withPromo.discount === 100, String(withPromo.discount));
  check(
    "скидка: цена за единицу = сумма / количество",
    withPromo.rows.every((r) => r.price === unitPriceOf(r.sum, r.quantity)),
  );
  check("скидка: цен меньше нуля нет", withPromo.rows.every((r) => r.price >= 0 && r.sum >= 0));
  check("скидка: исходные строки не изменены", rows[0].sum === 500 && rows[0].price === 50);

  const urgent = settleRows(rows, 1500);
  check("срочность: строки не тронуты", kop(urgent.rows.map((r) => r.sum)) === 100000);
  check("срочность: наценка отдельно", urgent.extra === 500 && urgent.discount === 0, String(urgent.extra));

  const exact = settleRows(rows, 1000);
  check("итог равен сумме строк: ни скидки, ни наценки", exact.extra === 0 && exact.discount === 0);

  const full = settleRows(rows, 0);
  check("промокод 100%: все строки нулевые, не отрицательные", full.rows.every((r) => r.sum === 0 && r.price === 0));
}

// ---- цена за единицу
check("цена за единицу: 100 / 3 до копейки", unitPriceOf(100, 3) === 33.33);
check("цена за единицу: нулевое количество", unitPriceOf(100, 0) === 0);

// ---- снимок названия
check("название без характеристик", itemSnapshotName("Визитки", []) === "Визитки");
check(
  "название с характеристиками",
  itemSnapshotName("Визитки", [
    { attribute: "Бумага", value: "мелованная 300" },
    { attribute: "Ламинация", value: "матовая" },
  ]) === "Визитки, Бумага: мелованная 300, Ламинация: матовая",
);
{
  const long = itemSnapshotName("Т".repeat(200), [{ attribute: "А".repeat(60), value: "З".repeat(60) }]);
  check("длинное название влезает в колонку", long.length <= 255 && long.endsWith("…"), String(long.length));
}

// ---- снимок реквизитов покупателя в contact_info
{
  const snap = buyerSnapshot({
    isCorporate: true,
    companyName: " ООО «Ромашка» ",
    inn: "7701234567",
    kpp: "",
    legalAddress: null,
  });
  check(
    "реквизиты: пробелы срезаны, пустое - null",
    snap.is_corporate === true && snap.company_name === "ООО «Ромашка»" && snap.kpp === null && snap.legal_address === null,
  );

  const json = JSON.stringify({ name: "Иван", phone: "1", ...snap });
  const parsed = parseContact(json);
  check(
    "parseContact читает снимок покупателя",
    parsed?.buyer?.isCorporate === true && parsed.buyer.companyName === "ООО «Ромашка»" && parsed.buyer.inn === "7701234567",
  );

  const old = parseContact(JSON.stringify({ name: "Иван", phone: "1" }));
  check("у старых заказов снимка покупателя нет", old?.buyer === undefined);

  const physical = parseContact(
    JSON.stringify({ name: "Иван", ...buyerSnapshot({ isCorporate: null, companyName: null, inn: null, kpp: null, legalAddress: null }) }),
  );
  check("физлицо: снимок есть, но не юрлицо", physical?.buyer?.isCorporate === false);
}

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
