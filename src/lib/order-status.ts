/**
 * Статусы заказа - подписи и цвета.
 *
 * Перенесено из OrderStatusValidator старого сайта. Эмодзи убраны:
 * экранная читалка проговаривает их вслух («галочка в зелёном квадрате
 * завершён»), а цвет и подпись передают то же самое без шума.
 */
export type OrderStatus =
  | "pending"
  | "processing"
  | "in_work"
  | "ready"
  | "delayed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "completed";

export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: { label: "Новый", className: "bg-ink/10 text-ink/70" },
  processing: { label: "В обработке", className: "bg-navy/12 text-navy" },
  in_work: { label: "В работе", className: "bg-warn/15 text-warn" },
  ready: { label: "Готов к выдаче", className: "bg-ok/12 text-ok" },
  delayed: { label: "Отложен", className: "bg-warn/15 text-warn" },
  shipped: { label: "Отправлен", className: "bg-brand/15 text-brand" },
  delivered: { label: "Доставлен", className: "bg-brand/15 text-brand" },
  completed: { label: "Завершён", className: "bg-ok/15 text-ok" },
  cancelled: { label: "Отменён", className: "bg-danger/12 text-danger" },
};

export function statusOf(value: string | null) {
  return ORDER_STATUS[(value ?? "pending") as OrderStatus] ?? ORDER_STATUS.pending;
}

/**
 * Куда заказ может перейти из каждого статуса.
 *
 * Раньше статус выбирался из полного списка: завершённый заказ можно было
 * вернуть в «Новый», а отменённый - в «Отправлен», и клиенту уходило
 * письмо о стадии, которой не было. Таблица та же для заказов менеджера:
 * производственные статусы у них совпадают с сайтовыми.
 *
 * Из «Отменён» - только обратно в начало (pending/processing): отмену
 * снимают, когда клиент передумал, и заказ проходит путь заново.
 * «Завершён» можно вернуть в «Доставлен» или «В работе» - чтобы исправить
 * ошибочное нажатие или принять заказ на доработку.
 *
 * «Готов к выдаче» ставит производство, когда пройден последний этап:
 * дальше заказ отправляют, доставляют или закрывают вручную - цех не знает,
 * забрал клиент заказ или нет. Из «Готов к выдаче» можно вернуться в
 * «В работе» (нашли недочёт, делаем заново).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["processing", "in_work", "delayed", "cancelled"],
  processing: ["pending", "in_work", "ready", "delayed", "shipped", "delivered", "completed", "cancelled"],
  in_work: ["processing", "ready", "delayed", "shipped", "delivered", "completed", "cancelled"],
  ready: ["in_work", "shipped", "delivered", "completed", "cancelled"],
  delayed: ["processing", "in_work", "shipped", "cancelled"],
  shipped: ["in_work", "ready", "delivered", "completed", "cancelled"],
  delivered: ["shipped", "completed"],
  completed: ["delivered", "in_work"],
  cancelled: ["pending", "processing"],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  // Object.hasOwn, а не `in`: "constructor" и "toString" - не статусы
  return typeof value === "string" && Object.hasOwn(ORDER_STATUS, value);
}

/** Можно ли перевести заказ из `from` в `to`. Тот же статус - можно (ничего не меняется). */
export function canChangeStatus(from: string | null, to: OrderStatus) {
  const current: OrderStatus = isOrderStatus(from) ? from : "pending";
  return current === to || ORDER_TRANSITIONS[current].includes(to);
}

/** Статусы, которые стоит предложить в списке: текущий и допустимые из него. */
export function nextStatuses(from: string | null): OrderStatus[] {
  const current: OrderStatus = isOrderStatus(from) ? from : "pending";
  return [current, ...ORDER_TRANSITIONS[current]];
}

/** Пояснение к уведомлению клиенту о новой стадии (пока только «готов»). */
export function statusNote(status: OrderStatus) {
  return status === "ready" ? "Заказ готов - менеджер свяжется по выдаче или отправке" : undefined;
}
