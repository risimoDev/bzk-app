/**
 * Внешние заказы - те, что оформляет менеджер, а не клиент через сайт.
 *
 * Это основной поток работы: в базе их семьдесят пять против одного
 * сайтового. У них два независимых состояния - оплата и производство,
 * поэтому и словаря два.
 */

export const EXTERNAL_PAYMENT_STATUS = {
  unpaid: { label: "Не оплачен", className: "bg-danger/12 text-danger" },
  partial: { label: "Частично", className: "bg-warn/15 text-warn" },
  paid: { label: "Оплачен", className: "bg-ok/15 text-ok" },
} as const;

export type ExternalPaymentStatus = keyof typeof EXTERNAL_PAYMENT_STATUS;

export function externalPaymentStatus(value: string | null) {
  return (
    EXTERNAL_PAYMENT_STATUS[(value ?? "unpaid") as ExternalPaymentStatus] ??
    EXTERNAL_PAYMENT_STATUS.unpaid
  );
}

/**
 * Производственные статусы те же, что у сайтовых заказов, - чтобы в
 * цехе не приходилось держать в голове два набора.
 */
export const EXTERNAL_PRODUCTION_STATUS = {
  pending: { label: "Новый", className: "bg-ink/10 text-ink/70" },
  processing: { label: "В обработке", className: "bg-navy/12 text-navy" },
  in_work: { label: "В работе", className: "bg-warn/15 text-warn" },
  delayed: { label: "Отложен", className: "bg-warn/15 text-warn" },
  shipped: { label: "Отправлен", className: "bg-brand/15 text-brand" },
  delivered: { label: "Доставлен", className: "bg-brand/15 text-brand" },
  completed: { label: "Завершён", className: "bg-ok/15 text-ok" },
  cancelled: { label: "Отменён", className: "bg-danger/12 text-danger" },
} as const;

export type ExternalProductionStatus = keyof typeof EXTERNAL_PRODUCTION_STATUS;

export function externalProductionStatus(value: string | null) {
  return (
    EXTERNAL_PRODUCTION_STATUS[(value ?? "pending") as ExternalProductionStatus] ??
    EXTERNAL_PRODUCTION_STATUS.pending
  );
}

/** Заказ закрыт: завершён или отменён - в работе он больше не числится. */
export function isExternalClosed(productionStatus: string | null) {
  return productionStatus === "completed" || productionStatus === "cancelled";
}

/**
 * Срок готовности прошёл, а заказ не закрыт.
 *
 * День срока ещё не просрочка: «готов к 12-му» значит «до конца 12-го».
 * Так же считает задачи lib/tasks.ts - чтобы заказ и задача по нему не
 * краснели в разные дни.
 */
export function isExternalLate(
  readyDate: Date | null,
  productionStatus: string | null,
  now = new Date(),
) {
  if (!readyDate || isExternalClosed(productionStatus)) return false;
  const end = new Date(readyDate);
  end.setHours(23, 59, 59, 999);
  return now.getTime() > end.getTime();
}

export const READY_CHANGE_TYPE = {
  set: "срок назначен",
  prolong: "срок продлён",
  edit: "срок изменён",
} as const;

export type ReadyChangeType = keyof typeof READY_CHANGE_TYPE;
