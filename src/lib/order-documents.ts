import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, externalOrders, orders } from "@/db/schema";
import type { OrderSource } from "@/lib/upd";

/**
 * Видны ли клиенту счёт и УПД по заказу.
 *
 * Две проверки сразу: заказ принадлежит этому клиенту и менеджер открыл
 * по нему документы. Чужой заказ не должен даже подтверждать своё
 * существование, а свой - показывать счёт до того, как состав и сумма
 * согласованы: клиент заплатил бы по черновику.
 *
 * Лежит отдельно от order-access.ts, потому что тот тянет `auth` со
 * всем next-auth: этот предикат должен оставаться вызываемым из
 * проверочных скриптов под голым node.
 */
export async function documentsVisibleToClient(
  source: OrderSource,
  orderId: number,
  userId: number,
) {
  if (source === "site") {
    const [row] = await db
      .select({ visible: orders.documentsVisible })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);
    return Boolean(row?.visible);
  }

  // Менеджерский заказ доходит до клиента через контрагента,
  // привязанного к его аккаунту
  const [row] = await db
    .select({ visible: externalOrders.documentsVisible })
    .from(externalOrders)
    .innerJoin(clients, eq(clients.id, externalOrders.clientId))
    .where(and(eq(externalOrders.id, orderId), eq(clients.userId, userId)))
    .limit(1);

  return Boolean(row?.visible);
}
