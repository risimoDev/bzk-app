/**
 * Что планировщику пора отправить.
 *
 * Чистая логика без базы и без Next: окна времени и проверки «пора ли»,
 * чтобы закрепить их скриптом (check:cron). Запросы в базу берут границы
 * отсюда же, поэтому SQL и проверка не расходятся.
 *
 * Правило одно для напоминаний и сроков задач: уведомление шлётся один
 * раз *на срок*. В строке хранится не флажок «отправлено», а тот срок, о
 * котором уже сообщили (`notified_remind_at`, `notified_due_date`). Срок
 * перенесли - значения перестали совпадать, и уведомление сработает
 * снова; не трогали - не сработает повторно, сколько бы раз ни шёл
 * планировщик.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Насколько давно просроченное напоминание ещё стоит отправлять. Старше -
 * это хвост, накопившийся до появления планировщика: рассылка сотне
 * давних напоминаний разом - шум, а не помощь.
 */
export const REMINDER_STALE_MS = 3 * DAY;

/** За сколько до срока предупреждать о задаче. */
export const TASK_LEAD_MS = DAY;

/** Просроченную задачу напоминаем только первые дни, дальше она уже на виду. */
export const TASK_STALE_MS = 3 * DAY;

/** Записи журнала лимитов живут не меньше суток, даже если окна короче. */
export const RATE_LIMIT_MIN_RETENTION_MS = DAY;

type Window = { from: Date; to: Date };

/** Напоминание подходит, когда его время наступило, но не слишком давно. */
export function reminderWindow(now: Date): Window {
  return { from: new Date(now.getTime() - REMINDER_STALE_MS), to: now };
}

/** Задача подходит, когда срок через сутки или уже прошёл (недавно). */
export function taskWindow(now: Date): Window {
  return {
    from: new Date(now.getTime() - TASK_STALE_MS),
    to: new Date(now.getTime() + TASK_LEAD_MS),
  };
}

function inWindow(at: Date, w: Window) {
  return at.getTime() >= w.from.getTime() && at.getTime() <= w.to.getTime();
}

/** Уже сообщали именно об этом сроке? */
function alreadyNotified(due: Date, notified: Date | null) {
  return notified !== null && notified.getTime() === due.getTime();
}

export function isReminderDue(
  r: { remindAt: Date; notifiedRemindAt: Date | null; isCompleted: boolean | null },
  now: Date,
) {
  if (r.isCompleted) return false;
  if (alreadyNotified(r.remindAt, r.notifiedRemindAt)) return false;
  return inWindow(r.remindAt, reminderWindow(now));
}

/** Задачи, которые считаются сделанными: о сроке напоминать не надо. */
export const TASK_FINISHED = ["completed", "cancelled"] as const;

export function isTaskDue(
  t: {
    dueDate: Date | null;
    notifiedDueDate: Date | null;
    status: string | null;
    assignedTo: number | null;
  },
  now: Date,
) {
  if (t.dueDate === null || t.assignedTo === null) return false;
  if ((TASK_FINISHED as readonly string[]).includes(t.status ?? "")) return false;
  if (alreadyNotified(t.dueDate, t.notifiedDueDate)) return false;
  return inWindow(t.dueDate, taskWindow(now));
}

/**
 * Граница уборки журнала лимитов: всё, что старше, никому не нужно.
 * `longestWindowSec` - самое длинное окно среди лимитов; запас вдвое, чтобы
 * не стереть запись, которая ещё считается.
 */
export function rateLimitCutoff(now: Date, longestWindowSec: number) {
  const keep = Math.max(RATE_LIMIT_MIN_RETENTION_MS, longestWindowSec * 2 * 1000);
  return new Date(now.getTime() - keep);
}

/** Сколько обрабатывать за один проход: защита от лавины после долгого простоя. */
export const BATCH_LIMIT = 200;
