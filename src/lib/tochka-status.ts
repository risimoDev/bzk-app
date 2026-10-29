/**
 * Статус оплаты счёта в Точке → наш статус.
 *
 * Раньше статус угадывался подстрокой: `raw.includes("paid")`. Под неё
 * попадают и "unpaid", и "notpaid", и «неоплачен» - неоплаченный счёт
 * становился оплаченным. Поэтому только точное сопоставление по словарю.
 *
 * Метод GET /invoice/v1.0/bills/{customerCode}/{documentId}/payment-status
 * отдаёт `Data.paymentStatus` со значениями payment_waiting, payment_paid,
 * payment_expired. Короткие формы оставлены на случай поля `status` и
 * ответа старой версии API. Модуль чистый: его проверяет скрипт.
 */

export type TochkaPaidStatus = "paid" | "expired";

/** null - счёт ещё ждёт оплаты, менять нечего. */
const STATUSES: Record<string, TochkaPaidStatus | null> = {
  payment_paid: "paid",
  paid: "paid",

  payment_expired: "expired",
  expired: "expired",

  payment_waiting: null,
  waiting: null,
  unpaid: null,
  not_paid: null,
  notpaid: null,
};

function keyOf(raw: unknown) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Знает ли словарь это значение. Незнакомое стоит записать в журнал. */
export function isKnownTochkaStatus(raw: unknown): boolean {
  // Object.hasOwn, а не `in`: "constructor" и "toString" - не статусы банка
  return Object.hasOwn(STATUSES, keyOf(raw));
}

/**
 * "paid" или "expired", если банк назвал статус точно; иначе null -
 * и ожидание, и всё незнакомое оставляют счёт как есть.
 */
export function tochkaStatusOf(raw: unknown): TochkaPaidStatus | null {
  const key = keyOf(raw);
  return Object.hasOwn(STATUSES, key) ? STATUSES[key] : null;
}
