import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientUploads, orders } from "@/db/schema";
import { CLIENT_UPLOAD_QUOTA } from "@/lib/client-portal";

/** Сколько байт клиент уже занял своими файлами. */
export async function clientUsedBytes(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${clientUploads.fileSize}), 0)` })
    .from(clientUploads)
    .where(eq(clientUploads.userId, userId));
  return Number(row?.total ?? 0);
}

/** Заказ принадлежит этому клиенту? Без проверки чужой номер открыл бы чужой заказ. */
export async function ownsOrder(userId: number, orderId: number) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export type NewClientUpload = {
  userId: number;
  orderId: number | null;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
};

/**
 * Записывает файл в базу, если он влезает в квоту.
 *
 * Предварительная проверка до загрузки отсекает очевидное, но две
 * параллельные загрузки обе увидели бы свободное место. Поэтому итог
 * сверяется ещё раз под блокировкой на клиента: вторая дождётся первой
 * и увидит уже занятое. Блокировка транзакционная - снимается сама.
 */
export async function insertUploadWithinQuota(
  row: NewClientUpload,
): Promise<{ ok: true } | { ok: false }> {
  return db.transaction(async (tx) => {
    // Первое число - свой «namespace» блокировок загрузок, второе - клиент
    await tx.execute(sql`select pg_advisory_xact_lock(7001, ${row.userId})`);

    const [used] = await tx
      .select({ total: sql<string>`coalesce(sum(${clientUploads.fileSize}), 0)` })
      .from(clientUploads)
      .where(eq(clientUploads.userId, row.userId));

    if (Number(used?.total ?? 0) + row.fileSize > CLIENT_UPLOAD_QUOTA) {
      return { ok: false } as const;
    }

    await tx.insert(clientUploads).values(row);
    return { ok: true } as const;
  });
}
