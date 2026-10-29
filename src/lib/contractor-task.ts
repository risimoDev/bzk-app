/**
 * Задание подрядчику: статус работы на позиции и номер задания.
 *
 * Модуль чистый - его подключают и серверные действия, и клиентский
 * выбор статуса, и проверочный скрипт. Данных клиента и денег здесь нет
 * намеренно: задание уходит на сторону.
 */

export const CONTRACTOR_STATUS = {
  not_sent: { label: "Не отправлено", className: "bg-ink/10 text-ink/70" },
  sent: { label: "Отправлено", className: "bg-navy/12 text-navy" },
  accepted: { label: "Принято", className: "bg-warn/15 text-warn" },
  shipped: { label: "Отгружено к нам", className: "bg-brand/15 text-brand" },
  received: { label: "Получено", className: "bg-ok/15 text-ok" },
} as const;

export type ContractorStatus = keyof typeof CONTRACTOR_STATUS;

/** Порядок этапов: по нему же решается, куда можно перейти. */
export const CONTRACTOR_STATUS_ORDER = Object.keys(CONTRACTOR_STATUS) as ContractorStatus[];

export function isContractorStatus(raw: unknown): raw is ContractorStatus {
  return typeof raw === "string" && Object.hasOwn(CONTRACTOR_STATUS, raw);
}

export function contractorStatusOf(raw: unknown): ContractorStatus {
  return isContractorStatus(raw) ? raw : "not_sent";
}

/**
 * Можно ли сменить статус.
 *
 * Вперёд - на любой этап (подрядчик мог сразу отгрузить, не ответив), назад
 * - только на шаг: так исправляют ошибочную отметку, но не стирают ход
 * работы. Тот же статус - не переход.
 */
export function canChangeContractorStatus(from: ContractorStatus, to: ContractorStatus) {
  const a = CONTRACTOR_STATUS_ORDER.indexOf(from);
  const b = CONTRACTOR_STATUS_ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return false;
  return b > a || b === a - 1;
}

/** Статусы, в которые отсюда можно перейти (для выпадающего списка). */
export function nextContractorStatuses(from: ContractorStatus): ContractorStatus[] {
  return CONTRACTOR_STATUS_ORDER.filter((s) => canChangeContractorStatus(from, s));
}

/**
 * Наш номер задания: «П-<номер заказа>-<id подрядчика>». По нему подрядчик
 * ссылается на задание, не зная, чей это заказ. Одно задание на пару
 * «заказ - подрядчик», поэтому номер не нужно хранить: он выводится.
 */
export function contractorTaskNumber(orderId: number, supplierId: number) {
  return `П-${orderId}-${supplierId}`;
}

type GroupableItem = { isOutsourced: boolean; supplierId: number | null };

/**
 * Позиции по подрядчикам. Перезаказ без подрядчика (у старых строк
 * бывает) в группы не входит: заданию некому адресоваться.
 */
export function groupBySupplier<T extends GroupableItem>(items: T[]) {
  const groups = new Map<number, T[]>();
  for (const i of items) {
    if (!i.isOutsourced || i.supplierId === null) continue;
    const list = groups.get(i.supplierId) ?? [];
    list.push(i);
    groups.set(i.supplierId, list);
  }
  return groups;
}
