/**
 * Деньги заказа - чистые правила.
 *
 * Итог, доход, расход, налог и статус оплаты раньше считались в пяти
 * местах по-разному: одно действие обновляло заказ, другое - карточку,
 * третье - только статус. Здесь правила, по которым считает единый
 * пересчёт (`order-money-db.ts`). Модуль без базы: его проверяет
 * scripts/check-money.mjs, и его же может звать форма.
 */

import { urgentFee } from "@/lib/promocodes";

export type PaymentState = "unpaid" | "partial" | "paid";

/** Деньги в копейках, чтобы сложение не набирало хвост из-за double. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Копейка туда-сюда при сложении numeric - не повод считать заказ
 * недоплаченным или оплаченным.
 */
export const MONEY_EPS = 0.005;

/**
 * Статус оплаты - только из суммы платежей.
 *
 * Одна функция на всё приложение: карточка бухгалтерии, заказ менеджера и
 * кабинет клиента показывают одно и то же. Раньше статус заказа менеджера
 * выбирали руками, и он расходился с платежами в бухгалтерии.
 *
 * Без платежей заказ не оплачен, даже если его сумма нулевая: «оплачен»
 * у пустого черновика выглядел бы как поступившие деньги.
 */
export function paymentStatusOf(income: number, paid: number): PaymentState {
  if (paid <= MONEY_EPS) return "unpaid";
  return paid + MONEY_EPS >= income ? "paid" : "partial";
}

/** Сколько ещё должны. Переплата долгом не считается. */
export function debtOf(income: number, paid: number) {
  return Math.max(0, round2(income - paid));
}

/**
 * Итог заказа с сайта: позиции + надбавка за срочность − скидка промокода.
 *
 * Скидка - сумма, зафиксированная при оформлении: пересчитывать процент
 * от новой суммы значило бы менять условия задним числом.
 */
export function siteOrderTotal(input: {
  subtotal: number;
  urgent: boolean;
  discount: number;
}) {
  const subtotal = round2(input.subtotal);
  const fee = urgentFee(subtotal, input.urgent);
  const discount = Number.isFinite(input.discount) ? Math.max(0, input.discount) : 0;
  return { subtotal, fee, total: round2(Math.max(0, subtotal + fee - discount)) };
}

/**
 * Итог заказа менеджера: позиции + корректировка (скидка со знаком минус).
 * Ниже нуля не бывает - отрицательный итог означал бы, что платим мы.
 */
export function externalOrderTotal(itemsSum: number, adjustment: number) {
  return round2(Math.max(0, round2(itemsSum) + round2(adjustment)));
}

/**
 * Описание строки расхода, которую заводит пересчёт. По нему её и находим
 * - остальные строки вписаны руками, их трогать нельзя.
 */
export const AUTO_EXPENSE = "Расчётная себестоимость по позициям заказа";

/**
 * Как ту же строку подписывал старый сайт.
 *
 * Без этих вариантов первый же пересчёт перенесённого заказа не находил
 * старую строку, оставлял её и дописывал свою - себестоимость удваивалась.
 */
export const LEGACY_AUTO_EXPENSE = [
  "Автоматический расчет себестоимости материалов",
  "Автоматический расчет себестоимости материалов (коррекция внеш.)",
];

export const AUTO_EXPENSE_LABELS = [AUTO_EXPENSE, ...LEGACY_AUTO_EXPENSE];

export function isAutoExpense(description: string | null) {
  return description !== null && AUTO_EXPENSE_LABELS.includes(description);
}

export type ExpenseRow = {
  amount: number | string;
  description: string | null;
  isWriteOff: boolean;
};

/**
 * Расход по заказу: «факт вытесняет оценку».
 *
 * Расчётная себестоимость - это оценка материалов по рецептуре. Как только
 * на заказ списали материал со склада, в расход идёт факт, а оценка
 * остаётся строкой для сравнения: иначе один и тот же материал входил бы
 * в расход дважды. Вписанные руками расходы (подрядчик, доставка)
 * учитываются всегда.
 */
export function effectiveExpense(rows: ExpenseRow[]) {
  const hasFact = rows.some((r) => r.isWriteOff);
  const sum = rows
    .filter((r) => !(hasFact && isAutoExpense(r.description)))
    .reduce((s, r) => s + Number(r.amount), 0);
  return round2(sum);
}

/** Налог от дохода по ставке в процентах. */
export function taxOf(income: number, ratePercent: number) {
  return round2(income * (ratePercent / 100));
}
