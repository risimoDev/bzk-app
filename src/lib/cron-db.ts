import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmLeads,
  crmReminders,
  ordersAccounting,
  rateLimits,
  tasks,
  telegramLinkCodes,
  users,
} from "@/db/schema";
import { deliverUser } from "@/lib/notify";
import { EVENTS } from "@/lib/notify-events";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import { LIMITS, checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { TIMEZONE } from "@/lib/dates";
import { DEBT_TASK_DUE_DAYS, isDebtTaskDue } from "@/lib/debts";
import { loadDebtOrders } from "@/lib/debts-db";
import { MONEY_EPS } from "@/lib/order-money";
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

/**
 * Что делать с неудачной доставкой: "retry" - попробуем в следующий проход,
 * "give-up" - отметим как обработанное и больше не будем.
 *
 * Сдаёмся в двух случаях. Все неудачи безнадёжные (бот заблокирован,
 * чата нет): повтор ничего не изменит. Или набралось достаточно попыток
 * (LIMITS.cronRetry): сбой затянулся, а без потолка запись крутилась бы
 * все трое суток окна, каждые пять минут, занимая место в пачке.
 * Попытки считаются в rate_limits по ключу вида «reminder:12:<срок>» - с
 * переносом срока счёт начинается заново.
 */
async function failureVerdict(
  r: { sent: number; failed: number; permanent?: number },
  retryKey: string,
): Promise<"delivered" | "retry" | "give-up"> {
  if (!(r.sent === 0 && r.failed > 0)) return "delivered";
  if ((r.permanent ?? 0) >= r.failed) {
    console.warn(`[cron] ${retryKey}: доставка невозможна (бот заблокирован или чата нет), больше не пробуем`);
    return "give-up";
  }
  await recordAttempt(retryKey, "cronRetry");
  if (!(await checkRateLimit(retryKey, "cronRetry")).ok) {
    console.warn(`[cron] ${retryKey}: ${LIMITS.cronRetry.max} попыток подряд не удались, больше не пробуем`);
    return "give-up";
  }
  return "retry";
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
    const verdict = await failureVerdict(result, `reminder:${r.id}:${r.remindAt.getTime()}`);
    if (verdict === "retry") continue;

    // Помечаем тем сроком, о котором сообщили, а не «сейчас»: если
    // напоминание успели перенести, оно сработает заново. Значение берём
    // из самой колонки, а не из JS-даты: Date держит миллисекунды, а в
    // базе микросекунды, и «почти равные» значения вечно считались бы
    // разными (напоминание слалось бы каждые пять минут)
    await db
      .update(crmReminders)
      .set({ notifiedRemindAt: sql`${crmReminders.remindAt}` })
      .where(eq(crmReminders.id, r.id));
    if (verdict === "delivered") handled++;
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
    const verdict = await failureVerdict(result, `task:${t.id}:${t.dueDate.getTime()}`);
    if (verdict === "retry") continue;

    // Значение из колонки, а не из JS-даты - см. напоминания выше
    await db
      .update(tasks)
      .set({ notifiedDueDate: sql`${tasks.dueDate}` })
      .where(eq(tasks.id, t.id));
    if (verdict === "delivered") handled++;
  }
  return handled;
}

const rubles = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIMEZONE });

/**
 * Задача менеджеру по заказу, долг по которому перешёл порог (6 дней с
 * готовности). Один раз на заказ: отметка `orders_accounting.debt_task_at`
 * ставится тем же UPDATE ... WHERE debt_task_at IS NULL, что и пускает
 * вставку задачи, поэтому два прохода не заведут две.
 *
 * Исполнитель - ответственный за заказ, если он действующий сотрудник
 * (назначенный в чате, запустивший в цех или последним работавший с
 * заказом). Если ответственного нет, исполнитель - автор задачи: задача
 * без исполнителя не попадёт в напоминания о сроках (они выбирают только
 * задачи с исполнителем), и о долге никто бы не узнал. Автор - первый
 * действующий администратор (`created_by` обязателен). Клиенту ничего не
 * отправляется. Уведомления при создании
 * задача не шлёт, как и обычная; срок в несколько дней нужен затем, чтобы
 * существующий механизм сроков задач напомнил исполнителю сам.
 *
 * `onlyCardIds` сужает проход (проверочный скрипт: на dev-базе с живыми
 * данными чужие заказы не трогаем).
 */
export async function createDebtTasks(
  now: Date,
  opts: { onlyCardIds?: readonly number[] } = {},
): Promise<number> {
  const due = (await loadDebtOrders({ now }))
    .filter((d) => isDebtTaskDue(d))
    .filter((d) => !opts.onlyCardIds || opts.onlyCardIds.includes(d.cardId))
    .slice(0, BATCH_LIMIT);
  if (due.length === 0) return 0;

  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ["admin", "manager"]), eq(users.isBlocked, false)))
    .orderBy(sql`(${users.role} = 'admin') desc`, asc(users.id))
    .limit(1);
  if (!author) {
    console.warn("[cron] debt-tasks: нет действующих сотрудников, задачи не заведены");
    return 0;
  }

  let created = 0;
  for (const d of due) {
    const dueDate = new Date(now.getTime() + DEBT_TASK_DUE_DAYS * 24 * 3600_000);
    await db.transaction(async (tx) => {
      const marked = await tx
        .update(ordersAccounting)
        .set({ debtTaskAt: sql`now()` })
        .where(
          and(
            eq(ordersAccounting.id, d.cardId),
            isNull(ordersAccounting.debtTaskAt),
            eq(ordersAccounting.isCancelled, false),
            // Долг перечитан в самом UPDATE: между выборкой и отметкой заказ
            // могли успеть оплатить, и задача по закрытому долгу не нужна
            sql`orders_accounting.income - coalesce((select sum(p.amount) from order_payments p where p.order_accounting_id = orders_accounting.id), 0) > ${MONEY_EPS}`,
          ),
        )
        .returning({ id: ordersAccounting.id });
      if (marked.length === 0) return;

      await tx.insert(tasks).values({
        title: `Долг по заказу № ${d.number}${d.source === "external" ? " (менеджера)" : " (с сайта)"}: ${rubles.format(d.debt)}`,
        description:
          `Клиент: ${d.partyName}. Долг ${rubles.format(d.debt)} при сумме заказа ${rubles.format(d.income)} ` +
          `(оплачено ${rubles.format(d.paid)}). Заказ готов с ${dayFmt.format(d.since as Date)}, ` +
          `${d.ageDays} дн. без полной оплаты. Свяжитесь с клиентом и уточните срок оплаты. ` +
          `Клиенту автоматически ничего не отправлялось.`,
        assignedTo: d.responsibleId ?? author.id,
        createdBy: author.id,
        priority: "medium",
        dueDate,
        relatedOrderAccountingId: d.cardId,
      });
      created++;
    });
  }
  return created;
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
    report.push(await runTask("debt-tasks", () => createDebtTasks(now)));
    report.push(await runTask("rate-limits-cleanup", () => cleanRateLimits(now)));
    report.push(await runTask("telegram-link-codes-cleanup", () => cleanTelegramLinkCodes(now)));
    return { ran: true as const, tasks: report };
  });
}
