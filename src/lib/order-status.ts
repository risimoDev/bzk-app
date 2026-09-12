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
  delayed: { label: "Отложен", className: "bg-warn/15 text-warn" },
  shipped: { label: "Отправлен", className: "bg-brand/15 text-brand" },
  delivered: { label: "Доставлен", className: "bg-brand/15 text-brand" },
  completed: { label: "Завершён", className: "bg-ok/15 text-ok" },
  cancelled: { label: "Отменён", className: "bg-danger/12 text-danger" },
};

export function statusOf(value: string | null) {
  return ORDER_STATUS[(value ?? "pending") as OrderStatus] ?? ORDER_STATUS.pending;
}
