import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  externalOrderItems,
  externalOrders,
  orderItems,
  orders,
  products,
} from "@/db/schema";

/**
 * Заказы клиента обоих видов в одном списке.
 *
 * Заказов у агентства два сорта: оформленные через сайт (`orders`) и
 * заведённые менеджером (`external_orders`). В кабинете клиента до сих
 * пор были видны только первые, и человек, у которого за год прошло
 * двадцать заказов, видел один. Менеджерские подтягиваются через
 * контрагента: он связан с аккаунтом одной ссылкой, и все его заказы
 * появляются разом.
 */

export type ClientOrder = {
  kind: "site" | "external";
  id: number;
  href: string;
  /** Что показывать чипом состояния. */
  status: string | null;
  /** Оплата - только у менеджерских заказов, у сайтовых её нет отдельно. */
  paymentStatus: string | null;
  total: string;
  isUrgent: boolean;
  createdAt: Date | null;
  readyDate: Date | null;
  preview: string;
};

export async function clientOrders(userId: number): Promise<ClientOrder[]> {
  const [site, counterparties] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalPrice: orders.totalPrice,
        isUrgent: orders.isUrgent,
        createdAt: orders.createdAt,
        readyDate: orders.readyDate,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt)),
    db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.userId, userId)),
  ]);

  const external = counterparties.length
    ? await db
        .select({
          id: externalOrders.id,
          status: externalOrders.productionStatus,
          paymentStatus: externalOrders.status,
          totalPrice: externalOrders.totalPrice,
          createdAt: externalOrders.createdAt,
          readyDate: externalOrders.estimatedReadyDate,
          description: externalOrders.description,
        })
        .from(externalOrders)
        .where(
          inArray(
            externalOrders.clientId,
            counterparties.map((c) => c.id),
          ),
        )
        .orderBy(desc(externalOrders.createdAt))
    : [];

  // Состав собираем отдельными сгруппированными запросами: подзапрос в
  // списке выбора Drizzle печатает без имени таблицы, и условие связи
  // сравнивает столбец сам с собой
  const [siteItems, externalItems] = await Promise.all([
    site.length
      ? db
          .select({
            orderId: orderItems.orderId,
            name: sql<string>`coalesce(${products.name}, ${orderItems.itemName}, 'позиция')`,
          })
          .from(orderItems)
          .leftJoin(products, eq(products.id, orderItems.productId))
          .where(
            inArray(
              orderItems.orderId,
              site.map((o) => o.id),
            ),
          )
          .orderBy(asc(orderItems.id))
      : Promise.resolve([]),
    external.length
      ? db
          .select({
            orderId: externalOrderItems.externalOrderId,
            name: sql<string>`coalesce(${products.name}, ${externalOrderItems.itemName}, 'позиция')`,
          })
          .from(externalOrderItems)
          .leftJoin(products, eq(products.id, externalOrderItems.productId))
          .where(
            inArray(
              externalOrderItems.externalOrderId,
              external.map((o) => o.id),
            ),
          )
          .orderBy(asc(externalOrderItems.id))
      : Promise.resolve([]),
  ]);

  const group = (rows: { orderId: number; name: string }[]) => {
    const map = new Map<number, string[]>();
    for (const r of rows) {
      const names = map.get(r.orderId) ?? [];
      names.push(r.name);
      map.set(r.orderId, names);
    }
    return map;
  };

  const sitePreview = group(siteItems);
  const externalPreview = group(externalItems);

  const list: ClientOrder[] = [
    ...site.map((o) => ({
      kind: "site" as const,
      id: o.id,
      href: `/client/orders/${o.id}`,
      status: o.status,
      paymentStatus: null,
      total: o.totalPrice,
      isUrgent: o.isUrgent,
      createdAt: o.createdAt,
      readyDate: o.readyDate,
      preview: sitePreview.get(o.id)?.join(", ") ?? "",
    })),
    ...external.map((o) => ({
      kind: "external" as const,
      id: o.id,
      href: `/client/orders/external/${o.id}`,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.totalPrice,
      isUrgent: false,
      createdAt: o.createdAt,
      readyDate: o.readyDate,
      // У менеджерских заказов позиции есть не всегда: часть описана
      // текстом, и тогда описание - единственное, чем заказ узнаётся
      preview: externalPreview.get(o.id)?.join(", ") || (o.description ?? ""),
    })),
  ];

  return list.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
}

/** Менеджерский заказ, если он принадлежит этому клиенту. */
export async function clientExternalOrder(userId: number, orderId: number) {
  const [row] = await db
    .select({
      id: externalOrders.id,
      description: externalOrders.description,
      status: externalOrders.productionStatus,
      paymentStatus: externalOrders.status,
      totalPrice: externalOrders.totalPrice,
      createdAt: externalOrders.createdAt,
      readyDate: externalOrders.estimatedReadyDate,
      address: externalOrders.address,
      documentsVisible: externalOrders.documentsVisible,
    })
    .from(externalOrders)
    .innerJoin(clients, eq(clients.id, externalOrders.clientId))
    .where(and(eq(externalOrders.id, orderId), eq(clients.userId, userId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select({
      id: externalOrderItems.id,
      name: sql<string>`coalesce(${products.name}, ${externalOrderItems.itemName}, 'позиция')`,
      description: externalOrderItems.itemDescription,
      quantity: externalOrderItems.quantity,
      price: externalOrderItems.price,
      unit: products.unit,
    })
    .from(externalOrderItems)
    .leftJoin(products, eq(products.id, externalOrderItems.productId))
    .where(eq(externalOrderItems.externalOrderId, orderId))
    .orderBy(asc(externalOrderItems.id));

  return { ...row, items };
}
