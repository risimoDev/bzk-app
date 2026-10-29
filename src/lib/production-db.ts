import "server-only";
import { and, asc, eq } from "drizzle-orm";
import {
  externalOrders,
  orders,
  productionOrders,
  productionOrderStages,
  productionStageLog,
  productionStages,
} from "@/db/schema";
import { ORDER_STATUS } from "@/lib/order-status";
import { nextStageIndex } from "@/lib/production";
import { MoneyRuleError, changeOrderStatus, type OrderRef, type Tx } from "@/lib/order-money-db";

/**
 * Ход производства: запуск, этапы, пауза.
 *
 * Здесь, а не в серверных действиях, чтобы проверочный скрипт мог пройти
 * цепочку без сессии. Права проверяет действие. Отказы по правилам - это
 * MoneyRuleError с текстом для человека.
 */

/** Статусы заказа, из которых цех переводит его в «Готов к выдаче». */
const BEFORE_READY = ["pending", "processing", "in_work", "delayed"] as const;
/** ...и в «В работе». */
const BEFORE_WORK = ["pending", "processing", "delayed"] as const;

/**
 * Запуск заказа в цех: заказ раскладывается по всем активным этапам,
 * первый становится текущим.
 */
export async function startProductionOf(tx: Tx, ref: OrderRef, createdBy: number | null) {
  // Порядок как на доске: (sort_order, id). При равном порядке без id
  // Postgres отдаёт этапы в произвольном порядке, и два заказа проходили
  // бы одну цепочку по-разному
  const stages = await tx
    .select()
    .from(productionStages)
    .where(eq(productionStages.isActive, true))
    .orderBy(asc(productionStages.sortOrder), asc(productionStages.id));
  if (stages.length === 0) throw new MoneyRuleError("Нет активных этапов производства");

  // Статус заказа меняется через общий changeOrderStatus: он же
  // пересчитывает деньги и не даёт производству оживить отменённый заказ.
  // Он же берёт блокировку заказа - поэтому проверка «уже в цехе» стоит
  // после него: две вкладки с кнопкой «В работу» не заведут дубль
  const res = await changeOrderStatus(tx, ref, "in_work", {
    system: true,
    onlyFrom: BEFORE_WORK,
  });
  // Отправленный или закрытый вручную заказ в цех не возвращаем
  if (!res.changed && res.from !== "in_work") {
    throw new MoneyRuleError(
      `Заказ в статусе «${ORDER_STATUS[res.from].label}» в цех не запускают`,
    );
  }

  const [existing] = await tx
    .select({ id: productionOrders.id })
    .from(productionOrders)
    .where(
      ref.source === "site"
        ? eq(productionOrders.orderId, ref.id)
        : eq(productionOrders.externalOrderId, ref.id),
    )
    .limit(1);
  if (existing) throw new MoneyRuleError("Заказ уже запущен в производство");

  const [created] = await tx
    .insert(productionOrders)
    .values({
      orderId: ref.source === "site" ? ref.id : null,
      externalOrderId: ref.source === "external" ? ref.id : null,
      status: "in_progress",
      currentStageId: stages[0].id,
      startedAt: new Date(),
      createdBy,
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

  return { productionOrderId: created.id, statusChanged: res.changed };
}

/**
 * Закрыть текущий этап и включить следующий; последний этап завершает
 * производство и переводит заказ в «Готов к выдаче».
 *
 * Этапы идут по порядку (sort_order, id), а не «со строго большим
 * sort_order»: у этапов с одинаковым порядком (новые этапы раньше
 * получали 0) такое правило перепрыгивало через всех, кроме первого.
 * Заказ, который менеджер уже отправил или закрыл вручную, назад в
 * «Готов» не тянем.
 */
export async function advanceProduction(
  tx: Tx,
  productionOrderId: number,
  userId: number | null,
) {
  // Сначала заказ, потом производственный заказ - тот же порядок, что у
  // отмены заказа (changeOrderStatus блокирует заказ, затем правит
  // производство). Обратный порядок давал взаимную блокировку при
  // одновременных «Этап готов» и «Отменить заказ». Номер заказа у
  // производственного заказа не меняется, поэтому читаем его без блокировки
  const [link] = await tx
    .select({
      orderId: productionOrders.orderId,
      externalOrderId: productionOrders.externalOrderId,
    })
    .from(productionOrders)
    .where(eq(productionOrders.id, productionOrderId))
    .limit(1);
  if (!link) throw new MoneyRuleError("Производственный заказ не найден");
  if (link.orderId) {
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, link.orderId)).for("no key update");
  }
  if (link.externalOrderId) {
    await tx
      .select({ id: externalOrders.id })
      .from(externalOrders)
      .where(eq(externalOrders.id, link.externalOrderId))
      .for("no key update");
  }

  // Блокировка производственного заказа - до чтения этапов: два нажатия
  // подряд (или две вкладки) закрыли бы один и тот же этап дважды и
  // перепрыгнули следующий
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

  if (!po) throw new MoneyRuleError("Производственный заказ не найден");
  if (po.status === "on_hold") {
    throw new MoneyRuleError("Производство приостановлено - сначала снимите паузу");
  }
  if (po.status === "cancelled") {
    throw new MoneyRuleError("Заказ отменён - производство остановлено");
  }
  if (po.status === "completed") throw new MoneyRuleError("Производство уже завершено");
  if (po.status !== "in_progress") throw new MoneyRuleError("Производство ещё не запущено");

  // Этапы читаем уже под блокировкой, чтобы видеть результат
  // предыдущего нажатия
  const rows = await tx
    .select({
      id: productionOrderStages.id,
      stageId: productionOrderStages.stageId,
      status: productionOrderStages.status,
    })
    .from(productionOrderStages)
    .where(eq(productionOrderStages.productionOrderId, productionOrderId))
    .orderBy(asc(productionOrderStages.sortOrder), asc(productionOrderStages.id));

  const step = nextStageIndex(rows.map((r) => r.status));
  if (!step) throw new MoneyRuleError("У заказа нет этапов, которые можно закрыть");

  const current = rows[step.current];
  const next = step.next === null ? null : rows[step.next];

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
    userId,
  });

  const result = {
    closedStageId: current.stageId,
    finished: false,
    siteOrderId: null as number | null,
    externalOrderId: null as number | null,
    /** Статус заказа с сайта действительно сменился (клиента надо уведомить) */
    siteStatusChanged: false,
  };

  if (next) {
    await tx
      .update(productionOrderStages)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(eq(productionOrderStages.id, next.id));

    await tx
      .update(productionOrders)
      .set({ currentStageId: next.stageId })
      .where(eq(productionOrders.id, productionOrderId));
    return result;
  }

  // Этапов больше нет - производство закончено
  result.finished = true;
  await tx
    .update(productionOrders)
    .set({ status: "completed", currentStageId: null, completedAt: new Date() })
    .where(eq(productionOrders.id, productionOrderId));

  // Статус заказа - через общий changeOrderStatus: он пересчитает деньги и
  // откажет, если заказ тем временем отменили
  if (po.orderId) {
    const res = await changeOrderStatus(tx, { source: "site", id: po.orderId }, "ready", {
      system: true,
      onlyFrom: BEFORE_READY,
    });
    result.siteOrderId = po.orderId;
    result.siteStatusChanged = res.changed;
  }
  if (po.externalOrderId) {
    await changeOrderStatus(tx, { source: "external", id: po.externalOrderId }, "ready", {
      system: true,
      onlyFrom: BEFORE_READY,
    });
    result.externalOrderId = po.externalOrderId;
  }

  return result;
}

/** Пауза и возврат в работу - под той же блокировкой, что и advanceProduction. */
export async function setProductionHold(tx: Tx, productionOrderId: number, hold: boolean) {
  // Пауза не должна проскочить между проверкой статуса и закрытием этапа
  const [po] = await tx
    .select({ status: productionOrders.status })
    .from(productionOrders)
    .where(eq(productionOrders.id, productionOrderId))
    .for("no key update")
    .limit(1);
  if (!po) throw new MoneyRuleError("Производственный заказ не найден");
  if (po.status === "cancelled") throw new MoneyRuleError("Заказ отменён - производство остановлено");
  if (po.status === "completed") throw new MoneyRuleError("Производство уже завершено");

  const want = hold ? "on_hold" : "in_progress";
  if (po.status === want) return;

  await tx
    .update(productionOrders)
    .set({ status: want })
    .where(
      and(eq(productionOrders.id, productionOrderId), eq(productionOrders.status, po.status ?? "pending")),
    );
}
