/**
 * Задачи по цеху и по сайту.
 *
 * Перенесено из admin/tasks. Пункты задачи хранятся в JSON-столбце
 * `task_items` простым списком строк - отметки «сделано» у пункта нет,
 * закрывается задача целиком.
 */

export const TASK_STATUS = {
  pending: { label: "Ждёт", className: "bg-ink/10 text-ink/65" },
  in_progress: { label: "В работе", className: "bg-warn/15 text-warn" },
  completed: { label: "Сделано", className: "bg-ok/15 text-ok" },
  cancelled: { label: "Отменена", className: "bg-danger/12 text-danger" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS;

export function taskStatus(value: string | null) {
  return TASK_STATUS[(value ?? "pending") as TaskStatus] ?? TASK_STATUS.pending;
}

export const TASK_PRIORITY = {
  low: { label: "Низкий", className: "text-ink/45", order: 0 },
  medium: { label: "Обычный", className: "text-ink/60", order: 1 },
  high: { label: "Высокий", className: "text-warn", order: 2 },
  urgent: { label: "Срочно", className: "text-danger", order: 3 },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITY;

export function taskPriority(value: string | null) {
  return TASK_PRIORITY[(value ?? "medium") as TaskPriority] ?? TASK_PRIORITY.medium;
}

/** Задача закрыта - в работе она больше не числится. */
export function isTaskClosed(status: string | null) {
  return status === "completed" || status === "cancelled";
}

/**
 * Пункты задачи из JSON-столбца.
 *
 * Столбец заполняли разные версии старого кода, поэтому там встречается
 * и список строк, и просто null. Всё, что не похоже на список строк,
 * считаем пустым - падать из-за одной кривой записи незачем.
 */
export function readTaskItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

/**
 * Просрочена ли задача.
 *
 * Сравниваем по календарному дню: задача со сроком «сегодня» просрочена
 * не с полуночи, а когда день кончился.
 */
export function isOverdue(dueDate: Date | null, status: string | null, now = new Date()) {
  if (!dueDate || isTaskClosed(status)) return false;

  const endOfDue = new Date(dueDate);
  endOfDue.setHours(23, 59, 59, 999);
  return now.getTime() > endOfDue.getTime();
}
