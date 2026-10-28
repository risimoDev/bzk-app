"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyOrderStatus } from "@/lib/notify";
import { ORDER_STATUS, statusNote } from "@/lib/order-status";
import { advanceProduction, setProductionHold, startProductionOf } from "@/lib/production-db";
import { currentUser } from "@/auth";
import { MoneyRuleError, type OrderRef } from "@/lib/order-money-db";

/**
 * Состояние форм цеха. Раньше действия молча возвращались при любом
 * отказе, и менеджер нажимал «Этап готов» на приостановленном заказе, не
 * понимая, почему ничего не происходит.
 */
export type ProductionState = { ok?: boolean; error?: string; message?: string };

const DENIED: ProductionState = { error: "У вашей роли нет права менять производство" };

/**
 * Запускает заказ в производство.
 *
 * Работает и для заказа с сайта, и для заказа менеджера: цех у них один,
 * и держать для менеджерских заказов отдельное поле «статус
 * производства» без стадий значило бы вести производство в двух местах.
 * В форму приходит либо `orderId`, либо `externalOrderId`.
 *
 * Правила - в startProductionOf (lib/production-db.ts).
 */
export async function startProduction(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  if (!(await can("kanban", "edit"))) return DENIED;

  const rawOrder = String(formData.get("orderId") ?? "").trim();
  const rawExternal = String(formData.get("externalOrderId") ?? "").trim();

  const orderId = rawOrder === "" ? null : Number(rawOrder);
  const externalOrderId = rawExternal === "" ? null : Number(rawExternal);

  const valid = (v: number | null) => v === null || (Number.isInteger(v) && v > 0);
  if (!valid(orderId) || !valid(externalOrderId)) return { error: "Заказ не найден" };
  // Ровно один из двух: заказ либо сайтовый, либо менеджерский
  if ((orderId === null) === (externalOrderId === null)) return { error: "Заказ не найден" };

  const me = await currentUser();
  const ref: OrderRef =
    orderId !== null
      ? { source: "site", id: orderId }
      : { source: "external", id: externalOrderId! };

  let statusChanged = false;
  try {
    const res = await db.transaction((tx) =>
      startProductionOf(tx, ref, me ? Number(me.id) : null),
    );
    statusChanged = res.statusChanged;
  } catch (e) {
    // Транзакция откатилась целиком - заказ остался как был
    if (e instanceof MoneyRuleError) return { error: e.message };
    throw e;
  }

  if (orderId !== null) {
    const [site] = await db
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    await audit("production.start", { type: "order", id: orderId });
    if (site && statusChanged) {
      await notifyOrderStatus({
        userId: site.userId,
        orderId,
        statusLabel: ORDER_STATUS.in_work.label,
      });
    }
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/client/orders/${orderId}`);
  } else {
    await audit("production.start", { type: "external_order", id: externalOrderId! });
    revalidatePath(`/admin/external-orders/${externalOrderId}`);
    revalidatePath("/admin/external-orders");
  }

  revalidatePath("/admin/production");
  return { ok: true, message: "Заказ запущен в производство" };
}

/**
 * Закрывает текущий этап и переводит заказ на следующий; последний этап
 * завершает производство и ставит заказу «Готов к выдаче». Правила - в
 * advanceProduction (lib/production-db.ts).
 */
export async function advanceStage(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  if (!(await can("kanban", "edit"))) return DENIED;

  const productionOrderId = Number(formData.get("productionOrderId"));
  if (!Number.isInteger(productionOrderId) || productionOrderId <= 0) {
    return { error: "Производственный заказ не найден" };
  }

  const me = await currentUser();

  let result: Awaited<ReturnType<typeof advanceProduction>>;
  try {
    result = await db.transaction((tx) =>
      advanceProduction(tx, productionOrderId, me ? Number(me.id) : null),
    );
  } catch (e) {
    if (e instanceof MoneyRuleError) return { error: e.message };
    throw e;
  }

  await audit("production.advance", { type: "production_order", id: productionOrderId }, {
    stageId: result.closedStageId,
    finished: result.siteOrderId ?? result.externalOrderId,
  });

  if (result.externalOrderId !== null) {
    revalidatePath(`/admin/external-orders/${result.externalOrderId}`);
    revalidatePath("/admin/external-orders");
  }

  if (result.siteOrderId !== null) {
    const [site] = await db
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, result.siteOrderId))
      .limit(1);

    if (site && result.siteStatusChanged) {
      await notifyOrderStatus({
        userId: site.userId,
        orderId: result.siteOrderId,
        statusLabel: ORDER_STATUS.ready.label,
        note: statusNote("ready"),
      });
    }
    revalidatePath(`/admin/orders/${result.siteOrderId}`);
    revalidatePath(`/client/orders/${result.siteOrderId}`);
  }

  revalidatePath("/admin/production");
  return {
    ok: true,
    message: result.finished ? "Производство завершено - заказ готов к выдаче" : "Этап закрыт",
  };
}

/** Приостановить или вернуть в работу. */
export async function setHold(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  if (!(await can("kanban", "edit"))) return DENIED;

  const id = Number(formData.get("productionOrderId"));
  const hold = formData.get("hold") === "1";
  if (!Number.isInteger(id) || id <= 0) return { error: "Производственный заказ не найден" };

  try {
    await db.transaction((tx) => setProductionHold(tx, id, hold));
  } catch (e) {
    if (e instanceof MoneyRuleError) return { error: e.message };
    throw e;
  }

  await audit("production.hold", { type: "production_order", id }, { hold });
  revalidatePath("/admin/production");
  return { ok: true, message: hold ? "Производство приостановлено" : "Производство продолжено" };
}
