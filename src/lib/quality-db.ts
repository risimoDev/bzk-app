import "server-only";
import { and, eq } from "drizzle-orm";
import { productionOrders, qcInspections, tasks, users } from "@/db/schema";
import type { Tx } from "@/lib/order-money-db";

/**
 * Контроль качества: связь проверки и брака с цехом.
 *
 * Раньше брак ни на что не влиял: проверка с итогом «Брак» записывалась,
 * а заказ спокойно шёл на следующий этап. Здесь живут правила, которые
 * проверочный скрипт может пройти без сессии; права проверяет действие.
 */

/** Отказ по правилу - текст показывается человеку. */
export class QualityRuleError extends Error {}

/**
 * Проверка ссылок дефекта: производственный заказ существует, а проверка
 * (если указана) относится именно к нему. Внешний ключ пропустил бы любой
 * существующий номер, и дефект оказался бы привязан к чужой проверке.
 */
export async function checkDefectRefs(
  tx: Tx,
  productionOrderId: number,
  inspectionId: number | null,
) {
  const [order] = await tx
    .select({ id: productionOrders.id })
    .from(productionOrders)
    .where(eq(productionOrders.id, productionOrderId))
    .limit(1);
  if (!order) throw new QualityRuleError("Производственный заказ не найден");

  if (inspectionId !== null) {
    const [inspection] = await tx
      .select({ id: qcInspections.id })
      .from(qcInspections)
      .where(
        and(
          eq(qcInspections.id, inspectionId),
          eq(qcInspections.productionOrderId, productionOrderId),
        ),
      )
      .limit(1);
    if (!inspection) throw new QualityRuleError("Проверка не относится к этому заказу");
  }
}

/**
 * Итог проверки «Брак»: производство на паузу и задача на разбор.
 *
 * Паузу ставим, только если заказ в работе: завершённое и отменённое
 * производство оживлять не надо, а уже приостановленное - и так на паузе.
 * Задачу заводим в любом случае (кроме отменённого заказа): брак надо
 * разобрать, даже если цех уже закончил.
 *
 * Исполнитель - тот, кто запустил заказ в цех, если он действующий
 * сотрудник; иначе сам проверяющий (задача не должна повиснуть ни на ком).
 */
export async function handleFailedInspection(
  tx: Tx,
  input: { productionOrderId: number; inspectionId: number; inspectorId: number },
) {
  const [po] = await tx
    .select({
      status: productionOrders.status,
      orderId: productionOrders.orderId,
      externalOrderId: productionOrders.externalOrderId,
      createdBy: productionOrders.createdBy,
    })
    .from(productionOrders)
    .where(eq(productionOrders.id, input.productionOrderId))
    .for("no key update")
    .limit(1);
  if (!po || po.status === "cancelled") return { paused: false, taskId: null };

  let paused = false;
  if (po.status === "in_progress") {
    await tx
      .update(productionOrders)
      .set({ status: "on_hold" })
      .where(eq(productionOrders.id, input.productionOrderId));
    paused = true;
  }

  let assignee = input.inspectorId;
  if (po.createdBy !== null) {
    const [owner] = await tx
      .select({ id: users.id, role: users.role, blocked: users.isBlocked })
      .from(users)
      .where(eq(users.id, po.createdBy))
      .limit(1);
    if (owner && !owner.blocked && (owner.role === "admin" || owner.role === "manager")) {
      assignee = owner.id;
    }
  }

  const label = po.orderId
    ? `№ ${po.orderId} (с сайта)`
    : `№ ${po.externalOrderId} (менеджера)`;

  const [task] = await tx
    .insert(tasks)
    .values({
      title: `Разобрать брак по заказу ${label}`,
      description:
        `Проверка качества № ${input.inspectionId} закончилась браком.` +
        (paused ? " Производство приостановлено - снимите паузу на доске, когда брак разобран." : ""),
      assignedTo: assignee,
      createdBy: input.inspectorId,
      priority: "high",
    })
    .returning({ id: tasks.id });

  return { paused, taskId: task.id };
}
