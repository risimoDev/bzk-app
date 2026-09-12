/** Подписи и расчёты для бухгалтерии. */

export type PaymentState = "unpaid" | "partial" | "paid";

export const PAYMENT_STATE: Record<
  PaymentState,
  { label: string; className: string }
> = {
  unpaid: { label: "Не оплачен", className: "bg-danger/12 text-danger" },
  partial: { label: "Частично", className: "bg-warn/15 text-warn" },
  paid: { label: "Оплачен", className: "bg-ok/15 text-ok" },
};

export const paymentStateOf = (v: string | null) =>
  PAYMENT_STATE[(v ?? "unpaid") as PaymentState] ?? PAYMENT_STATE.unpaid;

export const SOURCE: Record<string, string> = {
  site: "С сайта",
  external: "Внешний",
};

/**
 * Прибыль по заказу.
 *
 * Считается из строк, а не берётся готовой: в старой базе total_expense
 * хранится отдельным полем и может разойтись с суммой расходов, если
 * запись правили в обход пересчёта. Показывать нужно то, что вытекает
 * из документов.
 */
export function profitOf(input: {
  income: string | number | null;
  expense: string | number | null;
  tax: string | number | null;
}) {
  const income = Number(input.income ?? 0);
  const expense = Number(input.expense ?? 0);
  const tax = Number(input.tax ?? 0);
  const profit = income - expense - tax;

  return {
    income,
    expense,
    tax,
    profit,
    // Рентабельность считаем от выручки; при нулевой выручке она не
    // определена, и показывать «0%» было бы враньём
    margin: income > 0 ? (profit / income) * 100 : null,
  };
}

/** Границы периода: последние N месяцев, включая текущий. */
export function periodRange(months: number) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return { from, to: now };
}

export const PERIODS = [
  { key: "1", label: "Этот месяц", months: 1 },
  { key: "3", label: "3 месяца", months: 3 },
  { key: "12", label: "Год", months: 12 },
  { key: "all", label: "Всё время", months: 0 },
] as const;
