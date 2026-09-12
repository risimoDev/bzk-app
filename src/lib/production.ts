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
