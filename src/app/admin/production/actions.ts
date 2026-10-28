"use server";

import { eq, asc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  productionOrders,
  productionOrderStages,
  productionStages,
  productionStageLog,
  orders,
} from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyOrderStatus } from "@/lib/notify";
import { ORDER_STATUS } from "@/lib/order-status";
import { currentUser } from "@/auth";
import { MoneyRuleError, changeOrderStatus, type OrderRef } from "@/lib/order-money-db";

/**
 * Запускает заказ в производство.
 *
 * Работает и для заказа с сайта, и для заказа менеджера: цех у них один,
 * и держать для менеджерских заказов отдельное поле «статус
 * производства» без стадий значило бы вести производство в двух местах.
 * В форму приходит либо `orderId`, либо `externalOrderId`.
 *
 * Сразу раскладывает заказ по всем активным этапам: без этого доска
 * пуста, и непонятно, что заказу вообще предстоит. Первый этап
 * становится текущим и переходит в работу.
 */
export async function startProduction(formData: FormData) {
  if (!(await can("kanban", "edit"))) return;

  const rawOrder = String(formData.get("orderId") ?? "").trim();
  const rawExternal = String(formData.get("externalOrderId") ?? "").trim();

  const orderId = rawOrder === "" ? null : Number(rawOrder);
  const externalOrderId = rawExternal === "" ? null : Number(rawExternal);

  const valid = (v: number | null) => v === null || (Number.isInteger(v) && v > 0);
  if (!valid(orderId) || !valid(externalOrderId)) return;
  // Ровно один из двух: заказ либо сайтовый, либо менеджерский
  if ((orderId === null) === (externalOrderId === null)) return;

  const me = await currentUser();

  // Повторный запуск того же заказа создал бы дубль на доске
  const [existing] = await db
    .select({ id: productionOrders.id })
    .from(productionOrders)
    .where(
      orderId !== null
        ? eq(productionOrders.orderId, orderId)
        : eq(productionOrders.externalOrderId, externalOrderId!),
    )
    .limit(1);
  if (existing) return;

  const stages = await db
    .select()
    .from(productionStages)
    .where(eq(productionStages.isActive, true))
    .orderBy(asc(productionStages.sortOrder));

  if (stages.length === 0) return;

  const ref: OrderRef =
    orderId !== null
      ? { source: "site", id: orderId }
      : { source: "external", id: externalOrderId! };

  // Статус заказа меняется через общий changeOrderStatus: он же
  // пересчитывает деньги и не даёт производству оживить отменённый заказ.
  // Раньше статус писался напрямую, и отменённый заказ уходил «в работу»,
  // а его карточка оставалась вне выручки
  let statusChanged = false;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productionOrders)
        .values({
          orderId,
          externalOrderId,
          status: "in_progress",
          currentStageId: stages[0].id,
          startedAt: new Date(),
          createdBy: me ? Number(me.id) : null,
        })
        .returning({ id: productionOrders.id });

      await tx.insert(productionOrderStages).values(
        stages.map((s, i) => ({
          productionOrderId: created.id,
          stageId: s.id,
          status: i === 0 ? ("in_progress" as const) : ("pending" as const),
          startedAt: i === 0 ? new Date() : null,
          estimatedHours: s.defaultDurationHours,
          sortOrder: s.sortOrder ?? i,
        })),
      );

      // Сам заказ тоже переводим в работу - иначе клиент видит
      // «в обработке», пока в цехе уже режут
      const res = await changeOrderStatus(tx, ref, "in_work", { system: true });
      statusChanged = res.changed;
    });
  } catch (e) {
    // Отменённый заказ в цех не запускаем - транзакция откатилась целиком
    if (e instanceof MoneyRuleError) return;
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
}

/** Закрывает текущий этап и переводит заказ на следующий. */
export async function advanceStage(formData: FormData) {
  if (!(await can("kanban", "edit"))) return;

  const productionOrderId = Number(formData.get("productionOrderId"));
  if (!Number.isInteger(productionOrderId) || productionOrderId <= 0) return;

  const me = await currentUser();

  const rows = await db
    .select({
      id: productionOrderStages.id,
      stageId: productionOrderStages.stageId,
      status: productionOrderStages.status,
      sortOrder: productionOrderStages.sortOrder,
    })
    .from(productionOrderStages)
    .where(eq(productionOrderStages.productionOrderId, productionOrderId))
    .orderBy(asc(productionOrderStages.sortOrder));

  const current = rows.find((r) => r.status === "in_progress") ?? rows.find((r) => r.status === "pending");
  if (!current) return;

  const next = rows.find(
    (r) => (r.sortOrder ?? 0) > (current.sortOrder ?? 0) && r.status === "pending",
  );

  // Что рассказать клиенту, решаем по итогам транзакции: пока она не
  // прошла, заказ ещё на прежней стадии
  let finishedOrderId: number | null = null;
  let finishedExternalId: number | null = null;
  let finishedChanged = false;

  try {
    await db.transaction(async (tx) => {
      // Отменённое (или уже завершённое) производство не продвигаем: этап
      // закрылся бы, а последний перевёл бы отменённый заказ в «Завершён»
      const [po] = await tx
        .select({
          status: productionOrders.status,
          orderId: productionOrders.orderId,
          externalOrderId: productionOrders.externalOrderId,
        })
        .from(productionOrders)
        .where(eq(productionOrders.id, productionOrderId))
        .for("no key update")
        .limit(1);
      if (!po || po.status === "cancelled" || po.status === "completed") {
        throw new MoneyRuleError("Производство не идёт");
      }

      await tx
        .update(productionOrderStages)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(productionOrderStages.id, current.id));

      // Журнал ссылается на экземпляр этапа в конкретном заказе
      // (production_order_stages.id), а не на справочник этапов
      await tx.insert(productionStageLog).values({
        productionOrderStageId: current.id,
        productionOrderId,
        action: "completed",
        userId: me ? Number(me.id) : null,
      });

      if (next) {
        await tx
          .update(productionOrderStages)
          .set({ status: "in_progress", startedAt: new Date() })
          .where(eq(productionOrderStages.id, next.id));

        await tx
          .update(productionOrders)
          .set({ currentStageId: next.stageId })
          .where(eq(productionOrders.id, productionOrderId));
      } else {
        // Этапов больше нет - производство закончено
        await tx
          .update(productionOrders)
          .set({
            status: "completed",
            currentStageId: null,
            completedAt: new Date(),
          })
          .where(eq(productionOrders.id, productionOrderId));

        // Статус заказа - через общий changeOrderStatus: он пересчитает
        // деньги и откажет, если заказ тем временем отменили
        if (po.orderId) {
          const res = await changeOrderStatus(
            tx,
            { source: "site", id: po.orderId },
            "completed",
            { system: true },
          );
          finishedOrderId = po.orderId;
          finishedChanged = res.changed;
        }

        if (po.externalOrderId) {
          await changeOrderStatus(
            tx,
            { source: "external", id: po.externalOrderId },
            "completed",
            { system: true },
          );
          finishedExternalId = po.externalOrderId;
        }
      }
    });
  } catch (e) {
    if (e instanceof MoneyRuleError) return;
    throw e;
  }

  await audit("production.advance", { type: "production_order", id: productionOrderId }, {
    stageId: current.stageId,
    finished: finishedOrderId ?? finishedExternalId,
  });

  if (finishedExternalId !== null) {
    revalidatePath(`/admin/external-orders/${finishedExternalId}`);
    revalidatePath("/admin/external-orders");
  }

  if (finishedOrderId !== null) {
    const [site] = await db
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, finishedOrderId))
      .limit(1);

    if (site && finishedChanged) {
      await notifyOrderStatus({
        userId: site.userId,
        orderId: finishedOrderId,
        statusLabel: ORDER_STATUS.completed.label,
      });
    }
    revalidatePath(`/client/orders/${finishedOrderId}`);
  }

  revalidatePath("/admin/production");
}

/** Приостановить или вернуть в работу. */
export async function setHold(formData: FormData) {
  if (!(await can("kanban", "edit"))) return;

  const id = Number(formData.get("productionOrderId"));
  const hold = formData.get("hold") === "1";
  if (!Number.isInteger(id) || id <= 0) return;

  await db
    .update(productionOrders)
    .set({ status: hold ? "on_hold" : "in_progress" })
    .where(
      and(
        eq(productionOrders.id, id),
        // Завершённый заказ приостанавливать нечего
        eq(productionOrders.status, hold ? "in_progress" : "on_hold"),
      ),
    );

  await audit("production.hold", { type: "production_order", id }, { hold });
  revalidatePath("/admin/production");
}
