/** Статусы и приоритеты производства - подписи и цвета для админки. */

export type ProductionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";

export type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

export type Priority = "low" | "medium" | "high" | "urgent";

export const PRODUCTION_STATUS: Record<
  ProductionStatus,
  { label: string; className: string }
> = {
  pending: { label: "Ожидает", className: "bg-ink/10 text-ink/70" },
  in_progress: { label: "В работе", className: "bg-warn/15 text-warn" },
  completed: { label: "Готово", className: "bg-ok/15 text-ok" },
  on_hold: { label: "Приостановлено", className: "bg-navy/12 text-navy" },
  cancelled: { label: "Отменено", className: "bg-danger/12 text-danger" },
};

export const STAGE_STATUS: Record<
  StageStatus,
  { label: string; className: string }
> = {
  pending: { label: "Ожидает", className: "bg-ink/10 text-ink/60" },
  in_progress: { label: "В работе", className: "bg-warn/15 text-warn" },
  completed: { label: "Готово", className: "bg-ok/15 text-ok" },
  skipped: { label: "Пропущен", className: "bg-ink/8 text-ink/40" },
};

export const PRIORITY: Record<
  Priority,
  { label: string; className: string; weight: number }
> = {
  low: { label: "Низкий", className: "text-ink/40", weight: 0 },
  medium: { label: "Обычный", className: "text-ink/55", weight: 1 },
  high: { label: "Высокий", className: "text-warn", weight: 2 },
  urgent: { label: "Срочно", className: "text-danger", weight: 3 },
};

export const productionStatusOf = (v: string | null) =>
  PRODUCTION_STATUS[(v ?? "pending") as ProductionStatus] ??
  PRODUCTION_STATUS.pending;

export const stageStatusOf = (v: string | null) =>
  STAGE_STATUS[(v ?? "pending") as StageStatus] ?? STAGE_STATUS.pending;

export const priorityOf = (v: string | null) =>
  PRIORITY[(v ?? "medium") as Priority] ?? PRIORITY.medium;

/**
 * Какой этап закрывать и какой включать следующим.
 *
 * Принимает статусы этапов заказа уже в порядке прохождения
 * (sort_order, id). Текущий - первый «в работе» (нет такого - первый
 * ожидающий), следующий - первый ожидающий после него. Сравнение по
 * позиции в списке, а не по значению sort_order: у этапов с одинаковым
 * порядком (новые этапы раньше получали 0) строгое «больше» пропускало
 * все, кроме первого.
 *
 * Возвращает null, если закрывать нечего; `next: null` - текущий этап
 * последний.
 */
export function nextStageIndex(
  statuses: readonly (string | null)[],
): { current: number; next: number | null } | null {
  let current = statuses.findIndex((s) => s === "in_progress");
  if (current < 0) current = statuses.findIndex((s) => s === "pending");
  if (current < 0) return null;

  let next: number | null = null;
  for (let i = current + 1; i < statuses.length; i++) {
    if (statuses[i] === "pending") {
      next = i;
      break;
    }
  }
  return { current, next };
}
