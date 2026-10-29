import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { REVIEWABLE_ORDER_STATUSES } from "@/lib/reviews";

/**
 * Есть ли у клиента заказ с этим товаром, по которому уже можно писать отзыв.
 *
 * Одна проверка и для формы на карточке товара, и для сервера: иначе форма
 * показывалась бы тем, кому действие потом откажет.
 */
export async function hasReviewableOrder(userId: number, productId: number) {
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.productId, productId),
        eq(orders.userId, userId),
        inArray(orders.status, [...REVIEWABLE_ORDER_STATUSES]),
      ),
    )
    .limit(1);
  return Boolean(row);
}
