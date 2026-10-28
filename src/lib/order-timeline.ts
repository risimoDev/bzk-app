import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { productionOrders, productionOrderStages, productionStages } from "@/db/schema";

/**
 * Путь заказа для клиента.
 *
 * Перенесено из ClientPortalService::getOrderTimeline. Два отличия от
 * старой версии: отменённый и отложенный заказы там выпадали из шкалы -
 * их статусов не было в списке, и клиент видел путь, где не пройден ни
 * один шаг, включая уже случившееся создание. Теперь оба состояния
 * показываются явно.
 */

/** Порядок, в котором заказ проходит стадии. */
const FLOW = ["pending", "processing", "in_work", "ready", "shipped", "delivered", "completed"] as const;

const STAGE_LABELS: Record<string, string> = {
  pending: "Заказ принят",
  processing: "Принят в работу",
  in_work: "Производство",
  ready: "Готов к выдаче",
  shipped: "Отгружен",
  delivered: "Доставлен",
  completed: "Завершён",
};

export type TimelineStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  date?: Date | null;
  note?: string;
};

export type OrderTimeline = {
  steps: TimelineStep[];
  production: TimelineStep[];
  /** Заказ остановлен: отменён или отложен */
  halted: null | { kind: "cancelled" | "delayed"; label: string; text: string };
};

export async function buildTimeline(order: {
  id: number;
  status: string | null;
  createdAt: Date | null;
  readyDate: Date | null;
}): Promise<OrderTimeline> {
  const status = order.status ?? "pending";

  const halted =
    status === "cancelled"
      ? {
          kind: "cancelled" as const,
          label: "Заказ отменён",
          text: "Работы по заказу остановлены. Если это ошибка - напишите в поддержку, восстановим.",
        }
      : status === "delayed"
        ? {
            kind: "delayed" as const,
            label: "Заказ отложен",
            text: "Работы приостановлены - ждём материалы или ваше решение. Менеджер на связи.",
          }
        : null;

  // Отменённый заказ дальше по шкале не двигается, но всё, что было
  // сделано до отмены, скрывать нечестно - оставляем пройденным приём
  const currentIndex = FLOW.indexOf(status as (typeof FLOW)[number]);
  const reached = currentIndex >= 0 ? currentIndex : status === "pending" ? 0 : 0;

  const steps: TimelineStep[] = FLOW.map((key, i) => ({
    key,
    label: STAGE_LABELS[key],
    done: halted ? i === 0 : i <= reached,
    current: !halted && i === reached,
    date: i === 0 ? order.createdAt : key === "completed" ? order.readyDate : null,
  }));

  const rows = await db
    .select({
      stageId: productionOrderStages.stageId,
      name: productionStages.name,
      status: productionOrderStages.status,
      startedAt: productionOrderStages.startedAt,
      completedAt: productionOrderStages.completedAt,
    })
    .from(productionOrders)
    .innerJoin(
      productionOrderStages,
      eq(productionOrderStages.productionOrderId, productionOrders.id),
    )
    .innerJoin(productionStages, eq(productionStages.id, productionOrderStages.stageId))
    .where(eq(productionOrders.orderId, order.id))
    .orderBy(asc(productionOrderStages.sortOrder), asc(productionOrderStages.id));

  const production: TimelineStep[] = rows.map((r) => ({
    key: `prod-${r.stageId}`,
    label: r.name,
    done: r.status === "completed",
    current: r.status === "in_progress",
    date: r.completedAt ?? r.startedAt ?? null,
  }));

  return { steps, production, halted };
}
