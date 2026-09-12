import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/client-ip";

/**
 * Журнал действий сотрудников.
 *
 * Пишем туда, где потом будут разбираться «кто это сделал»: цена,
 * удаление, смена статуса, назначение, права, привязка контрагента.
 * На чтение списков журнал не заводим - он утонул бы в шуме.
 *
 * Запись журнала никогда не должна ронять само действие: заказ уже
 * создан, и падать на строчке в логе - худшее, что можно сделать.
 * Поэтому все ошибки здесь глотаются.
 */
export async function audit(
  action: string,
  entity: { type: string; id?: number | null },
  details?: Record<string, unknown>,
) {
  try {
    const user = await currentUser();
    const h = await headers();

    await db.insert(auditLog).values({
      userId: user ? Number(user.id) : null,
      action,
      entityType: entity.type,
      entityId: entity.id ?? null,
      details: details ?? null,
      ipAddress: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch {
    // намеренно молча: см. комментарий выше
  }
}
