import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { crmLeads, crmReminders, rateLimits, tasks, telegramLinkCodes, users } from "@/db/schema";
import { deliverUser } from "@/lib/notify";
import { EVENTS } from "@/lib/notify-events";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import { LIMITS } from "@/lib/rate-limit";
import { TIMEZONE } from "@/lib/dates";
import {
  BATCH_LIMIT,
  TASK_FINISHED,
  rateLimitCutoff,
  reminderWindow,
  taskWindow,
} from "@/lib/cron-due";

/**
 * Планировщик: периодические задачи приложения.
 *
 * Зовёт его маршрут POST /api/cron/run (см. там), раз в пять минут из
 * контейнера cron. Каждая задача идемпотентна: повторный запуск ничего не
 * делает повторно, поэтому пропущенный или удвоенный вызов безвреден.
 * Задачи независимы - сбой одной попадает в отчёт и не мешает остальным.
 */

/**
 * Ключ консультативной блокировки Postgres. Произвольное, но постоянное
 * число: оба запущенных одновременно прохода должны бороться за одно и то
 * же. Блокировка уровня транзакции - она снимается сама при коммите или
 * обрыве соединения, забыть её освободить нельзя.
 */
const CRON_LOCK_KEY = 4_220_017_001;

export type CronTaskReport = { name: string; ok: boolean; count: number; error?: string };

export type CronReport =
  | { ran: false; reason: "locked" }
  | { ran: true; tasks: CronTaskReport[] };

async function runTask(name: string, fn: () => Promise<number>): Promise<CronTaskReport> {
  try {
    return { name, ok: true, count: await fn() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[cron] задача «${name}» упала:`, error);
    return { name, ok: false, count: 0, error };
  }
}

/** Доставка не удалась ни в один канал - не помечаем, попробуем в следующий проход. */
function undelivered(r: { sent: number; failed: number }) {
  return r.sent === 0 && r.failed > 0;
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: TIMEZONE,
});

// ---------------------------------------------------------------- задачи

/** Напоминания, о которых пора сообщить. Только чтение - отправляет notifyReminders. */
export async function dueReminders(now: Date) {
  const w = reminderWindow(now);

  return db
    .select({
      id: crmReminders.id,
      message: crmReminders.message,
      remindAt: crmReminders.remindAt,
      assignedTo: crmReminders.assignedTo,
      leadId: crmReminders.leadId,
      leadName: crmLeads.name,
    })
    .from(crmReminders)
    .innerJoin(users, and(eq(users.id, crmReminders.assignedTo), inArray(users.role, ["admin", "manager"])))
    .leftJoin(crmLeads, eq(crmLeads.id, crmReminders.leadId))
    .where(
      and(
        or(isNull(crmReminders.isCompleted), eq(crmReminders.isCompleted, false)),
        // Границы - через операторы колонки: Drizzle пишет и читает timestamp без
        // пояса как UTC, а голый параметр в sql`` ушёл бы в поясе процесса
        gte(crmReminders.remindAt, w.from),
        lte(crmReminders.remindAt, w.to),
        sql`${crmReminders.notifiedRemindAt} is distinct from ${crmReminders.remindAt}`,
      ),
    )
    .orderBy(asc(crmReminders.remindAt))
    .limit(BATCH_LIMIT);
}

/** Наступившие напоминания CRM - исполнителю. Возвращает, сколько обработано. */
async function notifyReminders(now: Date): Promise<number> {
  let handled = 0;
  for (const r of await dueReminders(now)) {
    const text =
      `<b>Напоминание CRM</b>\n${esc(r.message)}` + (r.leadName ? `\nКлиент: ${esc(r.leadName)}` : "");
    const url = absoluteUrl(r.leadId ? `/admin/crm/${r.leadId}` : "/admin/crm");

    const result = await deliverUser(
      r.assignedTo,
      EVENTS.crmReminder,
      "Напоминание CRM",
      text,
      [[{ text: "Открыть", url }]],
      { telegramOnly: true },
    );
    if (undelivered(result)) continue;

    // Помечаем тем сроком, о котором сообщили, а не «сейчас»: если
    // напоминание успели перенести, оно сработает заново
    await db
      .update(crmReminders)
      .set({ notifiedRemindAt: r.remindAt })
      .where(eq(crmReminders.id, r.id));
    handled++;
  }
  return handled;
}

/** Задачи, о сроке которых пора сообщить. Только чтение. */
export async function dueTasks(now: Date) {
  const w = taskWindow(now);

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
    })
    .from(tasks)
    .innerJoin(users, and(eq(users.id, tasks.assignedTo), inArray(users.role, ["admin", "manager"])))
    .where(
      and(
        or(isNull(tasks.status), notInArray(tasks.status, [...TASK_FINISHED])),
        gte(tasks.dueDate, w.from),
        lte(tasks.dueDate, w.to),
        sql`${tasks.notifiedDueDate} is distinct from ${tasks.dueDate}`,
      ),
    )
    .orderBy(asc(tasks.dueDate))
    .limit(BATCH_LIMIT);
}

/** Задачи, у которых срок завтра или уже прошёл, - исполнителю. */
async function notifyTaskDeadlines(now: Date): Promise<number> {
  let handled = 0;
  for (const t of await dueTasks(now)) {
    if (t.dueDate === null || t.assignedTo === null) continue;

    const overdue = t.dueDate.getTime() < now.getTime();
    const text =
      `<b>${overdue ? "Срок задачи прошёл" : "Скоро срок задачи"}</b>\n` +
      `${esc(t.title)}\nСрок: ${esc(dateFmt.format(t.dueDate))}`;

    const result = await deliverUser(
      t.assignedTo,
      EVENTS.taskDeadline,
      "Срок задачи",
      text,
      [[{ text: "Открыть задачи", url: absoluteUrl("/admin/tasks") }]],
      { telegramOnly: true },
    );
    if (undelivered(result)) continue;

    await db.update(tasks).set({ notifiedDueDate: t.dueDate }).where(eq(tasks.id, t.id));
    handled++;
  }
  return handled;
}

/** Журнал лимитов растёт с каждой попыткой входа; старые записи не нужны. */
export async function cleanRateLimits(now: Date): Promise<number> {
  const longest = Math.max(...Object.values(LIMITS).map((l) => l.window));
  const result = await db.delete(rateLimits).where(lt(rateLimits.attemptedAt, rateLimitCutoff(now, longest)));
  return result.rowCount ?? 0;
}

/** Просроченные коды привязки телеграма. */
export async function cleanTelegramLinkCodes(now: Date): Promise<number> {
  const result = await db.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, now));
  return result.rowCount ?? 0;
}

// ------------------------------------------------------------- запуск

/**
 * Один проход планировщика.
 *
 * Если предыдущий ещё идёт (Telegram отвечал долго), этот ничего не
 * делает: два одновременных прохода выбрали бы одни и те же напоминания и
 * отправили их дважды. Занятость определяет консультативная блокировка
 * Postgres - общая для всех процессов, в отличие от переменной в памяти.
 */
export async function runCron(now: Date = new Date()): Promise<CronReport> {
  return db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${CRON_LOCK_KEY}::bigint) as locked`,
    );
    if (!lock.rows[0]?.locked) return { ran: false as const, reason: "locked" as const };

    // Сами задачи идут через общий пул, а не через tx: транзакция нужна
    // только как держатель блокировки
    const report: CronTaskReport[] = [];
    report.push(await runTask("crm-reminders", () => notifyReminders(now)));
    report.push(await runTask("task-deadlines", () => notifyTaskDeadlines(now)));
    report.push(await runTask("rate-limits-cleanup", () => cleanRateLimits(now)));
    report.push(await runTask("telegram-link-codes-cleanup", () => cleanTelegramLinkCodes(now)));
    return { ran: true as const, tasks: report };
  });
}
