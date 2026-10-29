import type { OrderStatus } from "@/lib/order-status";

/**
 * В каких статусах заказа по нему можно оставить отзыв.
 *
 * Раньше хватало самого факта заказа, и отзыв оставляли по отменённому, а
 * то и по только что оформленному - товара клиент в руках не держал.
 * «Отправлен», «доставлен» и «завершён» - товар уже у клиента или в пути.
 * «Готов к выдаче» не берём: клиент его ещё не забрал.
 *
 * Список обязан состоять из настоящих статусов (check:reviews сверяет его
 * с таблицей переходов): опечатка здесь молча закрыла бы отзывы всем.
 */
export const REVIEWABLE_ORDER_STATUSES = ["shipped", "delivered", "completed"] as const satisfies readonly OrderStatus[];

export function canReviewAfter(status: string | null) {
  return (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(status ?? "");
}
