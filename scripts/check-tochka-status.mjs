/**
 * Проверка разбора статуса оплаты счёта в Точке.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-tochka-status.mjs
 *
 * Статус раньше угадывался подстрокой "paid", и "unpaid" делал счёт
 * оплаченным. Здесь стережём, что оплаченным считается только явный
 * ответ банка, а всё незнакомое оставляет счёт как есть.
 */
import { tochkaStatusOf, isKnownTochkaStatus } from "../src/lib/tochka-status.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const show = (raw) => JSON.stringify(tochkaStatusOf(raw));

// ------------------------------------------------------- оплачен

check("payment_paid - оплачен", tochkaStatusOf("payment_paid") === "paid", show("payment_paid"));
check("paid - оплачен", tochkaStatusOf("paid") === "paid");
check("PAYMENT_PAID с пробелами - оплачен", tochkaStatusOf("  PAYMENT_PAID ") === "paid");

// ---------------------------------------------- не оплачен - главное

for (const raw of ["unpaid", "notpaid", "not_paid", "payment_unpaid", "неоплачен", "не оплачен", "partially_paid"]) {
  check(`«${raw}» - не оплачен`, tochkaStatusOf(raw) !== "paid", show(raw));
}

check("payment_waiting - без изменений", tochkaStatusOf("payment_waiting") === null);
check("payment_waiting - знакомый статус", isKnownTochkaStatus("payment_waiting"));

// -------------------------------------------------------- просрочен

check("payment_expired - просрочен", tochkaStatusOf("payment_expired") === "expired");
check("expired - просрочен", tochkaStatusOf("expired") === "expired");
check("not_expired - не просрочен", tochkaStatusOf("not_expired") === null);

// ------------------------------------------------------- мусор

check("пустая строка - без изменений", tochkaStatusOf("") === null);
check("undefined - без изменений", tochkaStatusOf(undefined) === null);
check("число - без изменений", tochkaStatusOf(1) === null);
check("«constructor» - без изменений", tochkaStatusOf("constructor") === null);
check("«constructor» - незнакомый", !isKnownTochkaStatus("constructor"));
check("«неоплачен» - незнакомый, попадёт в журнал", !isKnownTochkaStatus("неоплачен"));

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
