/**
 * Промокоды: расчёт скидки.
 *
 * Чистая часть - её зовут и форма оформления, и серверное действие.
 * Работа с базой в `promocodes-db.ts`.
 */

export type PromoRule = {
  code: string;
  discountType: "percentage" | "fixed" | null;
  discountValue: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
};

/**
 * Скидка по коду для конкретной суммы.
 *
 * Считаем здесь, а не в форме: цену корзины браузеру доверять нельзя, и
 * итог всё равно пересчитывается на сервере - пусть считает один и тот
 * же код.
 */
export function discountFor(rule: PromoRule, subtotal: number) {
  const value = Number(rule.discountValue);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw =
    rule.discountType === "fixed" ? value : (subtotal * value) / 100;

  const cap = Number(rule.maxDiscountAmount ?? 0);
  const capped = cap > 0 ? Math.min(raw, cap) : raw;

  // Скидка не может увести заказ в минус
  return Math.round(Math.min(capped, subtotal) * 100) / 100;
}

/** Как показать условие скидки в интерфейсе. */
export function discountLabel(rule: PromoRule) {
  const value = Number(rule.discountValue);
  return rule.discountType === "fixed"
    ? `− ${value.toFixed(0)} ₽`
    : `− ${value.toFixed(0)}%`;
}

/** Надбавка за срочность: половина сверху, как было на старом сайте. */
export const URGENT_RATE = 0.5;

export function urgentFee(subtotal: number, urgent: boolean) {
  return urgent ? Math.round(subtotal * URGENT_RATE * 100) / 100 : 0;
}
