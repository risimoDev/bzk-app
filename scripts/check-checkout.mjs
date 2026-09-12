/**
 * Проверки арифметики оформления заказа.
 *
 *   npm run check:checkout
 *
 * Считаем то, из чего складывается итог: надбавку за срочность и скидку
 * по промокоду. Ошибка здесь стоит денег в обе стороны, а увидеть её на
 * глаз в готовом заказе почти нельзя.
 */
import { discountFor, urgentFee, URGENT_RATE } from "@/lib/promocodes";

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

// ---- срочность
check("надбавка - половина суммы", urgentFee(1000, true) === 500);
check("без срочности надбавки нет", urgentFee(1000, false) === 0);
check("ставка срочности 50%", URGENT_RATE === 0.5);
check("копейки округляются", urgentFee(333.33, true) === 166.67, String(urgentFee(333.33, true)));

// ---- процентная скидка
const percent = {
  code: "TEST10",
  discountType: "percentage",
  discountValue: "10",
  minOrderAmount: null,
  maxDiscountAmount: null,
};
check("процент считается от суммы", discountFor(percent, 1000) === 100);
check("процент округляется до копеек", discountFor(percent, 333.33) === 33.33, String(discountFor(percent, 333.33)));

// ---- потолок скидки
const capped = { ...percent, discountValue: "50", maxDiscountAmount: "300" };
check("потолок ограничивает скидку", discountFor(capped, 1000) === 300);
check("под потолком скидка полная", discountFor(capped, 400) === 200);

// ---- фиксированная скидка
const fixed = { ...percent, discountType: "fixed", discountValue: "250" };
check("фиксированная скидка", discountFor(fixed, 1000) === 250);
check(
  "скидка не больше суммы заказа",
  discountFor(fixed, 100) === 100,
  String(discountFor(fixed, 100)),
);

// ---- мусор
check("нулевая скидка ничего не даёт", discountFor({ ...percent, discountValue: "0" }, 1000) === 0);
check(
  "отрицательная скидка отброшена",
  discountFor({ ...percent, discountValue: "-10" }, 1000) === 0,
);
check(
  "нечисловая скидка отброшена",
  discountFor({ ...percent, discountValue: "abc" }, 1000) === 0,
);

// ---- порядок действий: срочность считается до скидки
const sum = 1000;
const withUrgent = sum + urgentFee(sum, true);
check(
  "скидка считается от суммы со срочностью",
  withUrgent - discountFor(percent, withUrgent) === 1350,
  String(withUrgent - discountFor(percent, withUrgent)),
);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
