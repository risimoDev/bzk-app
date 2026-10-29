/**
 * Проверка планировщика, отзывов и откладывания уведомлений.
 *
 *   npm run check:cron
 *
 * Чистая часть: что пора отправлять (окна, «один раз на срок»), секрет
 * планировщика, статусы заказа для отзыва, `afterResponse` вне запроса.
 * Часть с базой читает кандидатов на отправку и чистит записи, но
 * НИЧЕГО НЕ ОТПРАВЛЯЕТ: полный проход планировщика уведомил бы настоящих
 * сотрудников из dev-базы. Блокировку проверяем только на занятой - тогда
 * проход заканчивается до первой задачи.
 *
 * Скрипт заводит свои строки с пометкой и убирает их за собой.
 */
import { databaseUrl } from "./db-url.mjs";

process.env.DATABASE_URL = databaseUrl();

const due = await import("../src/lib/cron-due.ts");
const { cronAuthorized } = await import("../src/lib/cron-auth.ts");
const { REVIEWABLE_ORDER_STATUSES, canReviewAfter } = await import("../src/lib/reviews.ts");
const { ORDER_STATUS, ORDER_TRANSITIONS } = await import("../src/lib/order-status.ts");
const { NEW_EVENTS, EVENTS } = await import("../src/lib/notify-events.ts");
const { afterResponse } = await import("@/lib/notify-after");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = new Date("2026-06-10T10:00:00Z");
const at = (ms) => new Date(now.getTime() + ms);

// ------------------------------------------------ напоминания: пора ли

const rem = (over = {}) => ({ remindAt: at(-HOUR), notifiedRemindAt: null, isCompleted: false, ...over });

check("напоминание наступило - пора", due.isReminderDue(rem(), now));
check("напоминание в будущем - рано", !due.isReminderDue(rem({ remindAt: at(HOUR) }), now));
check("ровно сейчас - пора", due.isReminderDue(rem({ remindAt: now }), now));
check("выполненное не напоминаем", !due.isReminderDue(rem({ isCompleted: true }), now));
check("isCompleted = null считается невыполненным", due.isReminderDue(rem({ isCompleted: null }), now));
check(
  "уже сообщали об этом сроке - второй раз нет",
  !due.isReminderDue(rem({ notifiedRemindAt: at(-HOUR) }), now),
);
check(
  "срок перенесли - сообщаем снова",
  due.isReminderDue(rem({ remindAt: at(-HOUR), notifiedRemindAt: at(-2 * HOUR) }), now),
);
check("давний хвост не рассылаем", !due.isReminderDue(rem({ remindAt: at(-4 * DAY) }), now));
check("граница хвоста включается", due.isReminderDue(rem({ remindAt: at(-due.REMINDER_STALE_MS) }), now));

// ---------------------------------------------------- задачи: пора ли

const task = (over = {}) => ({
  dueDate: at(10 * HOUR),
  notifiedDueDate: null,
  status: "pending",
  assignedTo: 7,
  ...over,
});

check("срок через 10 часов - предупреждаем", due.isTaskDue(task(), now));
check("срок через 2 суток - рано", !due.isTaskDue(task({ dueDate: at(2 * DAY) }), now));
check("срок прошёл вчера - напоминаем", due.isTaskDue(task({ dueDate: at(-DAY) }), now));
check("просрочена давно - не трогаем", !due.isTaskDue(task({ dueDate: at(-5 * DAY) }), now));
check("выполненная не нужна", !due.isTaskDue(task({ status: "completed" }), now));
check("отменённая не нужна", !due.isTaskDue(task({ status: "cancelled" }), now));
check("в работе нужна", due.isTaskDue(task({ status: "in_progress" }), now));
check("без исполнителя некого предупреждать", !due.isTaskDue(task({ assignedTo: null }), now));
check("без срока нечего предупреждать", !due.isTaskDue(task({ dueDate: null }), now));
check("уже сообщали - второй раз нет", !due.isTaskDue(task({ notifiedDueDate: at(10 * HOUR) }), now));
check("срок передвинули - сообщаем снова", due.isTaskDue(task({ notifiedDueDate: at(5 * HOUR) }), now));

// --------------------------------------------------- уборка журнала

const cutoff = due.rateLimitCutoff(now, 15 * 60);
check("короткие окна хранятся не меньше суток", now.getTime() - cutoff.getTime() === DAY);
const longCut = due.rateLimitCutoff(now, 2 * 24 * 3600);
check("длинное окно хранится вдвое дольше", now.getTime() - longCut.getTime() === 4 * DAY);

// ---------------------------------------------------- секрет cron

check("верный секрет проходит", cronAuthorized("Bearer s3cret-value", "s3cret-value"));
check("регистр слова Bearer не важен", cronAuthorized("bearer s3cret-value", "s3cret-value"));
check("неверный секрет не проходит", !cronAuthorized("Bearer other", "s3cret-value"));
check("префикс секрета не проходит", !cronAuthorized("Bearer s3cret", "s3cret-value"));
check("секрет с хвостом не проходит", !cronAuthorized("Bearer s3cret-value-and-more", "s3cret-value"));
check("без заголовка не проходит", !cronAuthorized(null, "s3cret-value"));
check("без слова Bearer не проходит", !cronAuthorized("s3cret-value", "s3cret-value"));
check("пустой секрет в окружении не пускает никого", !cronAuthorized("Bearer ", ""));
check("секрет не задан - не пускает даже пустой заголовок", !cronAuthorized("Bearer x", undefined));
check("пробелы вокруг секрета в env не мешают", cronAuthorized("Bearer s3cret-value", " s3cret-value\n"));

// ------------------------------------------------ отзывы: статусы

check(
  "для отзыва - только настоящие статусы заказа",
  REVIEWABLE_ORDER_STATUSES.every((s) => Object.hasOwn(ORDER_STATUS, s)),
);
check("по отменённому и новому заказу отзыва нет", !canReviewAfter("cancelled") && !canReviewAfter("pending"));
check("по неготовому и готовому к выдаче отзыва нет", !canReviewAfter("in_work") && !canReviewAfter("ready"));
check(
  "отправлен, доставлен и завершён - можно",
  canReviewAfter("shipped") && canReviewAfter("delivered") && canReviewAfter("completed"),
);
check("пустой статус - нельзя", !canReviewAfter(null));
check(
  "каждый статус отзыва достижим по таблице переходов",
  REVIEWABLE_ORDER_STATUSES.every((s) => Object.values(ORDER_TRANSITIONS).some((to) => to.includes(s))),
);

// -------------------------------------------- справочник событий

check(
  "коды новых событий уникальны и в стиле «раздел.событие»",
  new Set(NEW_EVENTS.map((e) => e.code)).size === NEW_EVENTS.length &&
    NEW_EVENTS.every((e) => /^[a-z]+\.[a-z_]+$/.test(e.code)),
);
check(
  "все новые события описаны в EVENTS",
  NEW_EVENTS.every((e) => Object.values(EVENTS).includes(e.code)),
);

// ------------------------------------------ afterResponse вне запроса

let ran = 0;
afterResponse("check", async () => {
  ran++;
});
afterResponse("check", async () => {
  throw new Error("задача упала");
});
await new Promise((r) => setTimeout(r, 50));
check("вне запроса задача запускается сразу", ran === 1);
check("упавшая задача не роняет вызывающего", true);

// ------------------------------------------------------- с базой

const { eq, like } = await import("drizzle-orm");
const { db } = await import("@/db");
const { crmReminders, rateLimits, tasks, telegramLinkCodes, users } = await import("@/db/schema");
const cron = await import("../src/lib/cron-db.ts");

const MARK = "proverka-cron@example.invalid";
let userId = null;

async function cleanup() {
  if (userId !== null) {
    await db.delete(crmReminders).where(eq(crmReminders.assignedTo, userId));
    await db.delete(tasks).where(eq(tasks.createdBy, userId));
    await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
  }
  await db.delete(rateLimits).where(like(rateLimits.identifier, "check-cron:%"));
  await db.delete(users).where(eq(users.email, MARK));
}

try {
  await cleanup();
  const [u] = await db
    .insert(users)
    .values({ email: MARK, name: "Проверка планировщика", password: "x", role: "manager" })
    .returning({ id: users.id });
  userId = u.id;

  const realNow = new Date();
  const hourAgo = new Date(realNow.getTime() - HOUR);

  // Напоминание: наступило, исполнителю ещё не сообщали
  const [r1] = await db
    .insert(crmReminders)
    .values({ remindAt: hourAgo, message: "Проверка", assignedTo: userId })
    .returning({ id: crmReminders.id });
  const [future] = await db
    .insert(crmReminders)
    .values({ remindAt: new Date(realNow.getTime() + DAY), message: "Позже", assignedTo: userId })
    .returning({ id: crmReminders.id });

  let rows = (await cron.dueReminders(realNow)).filter((r) => r.assignedTo === userId);
  check("напоминание, которое наступило, попало в выборку", rows.some((r) => r.id === r1.id));
  check("напоминание в будущем - нет", !rows.some((r) => r.id === future.id));

  // Помечаем так же, как это делает планировщик
  await db.update(crmReminders).set({ notifiedRemindAt: rows.find((r) => r.id === r1.id).remindAt }).where(eq(crmReminders.id, r1.id));
  rows = (await cron.dueReminders(realNow)).filter((r) => r.assignedTo === userId);
  check("после отметки второй раз не выбирается", !rows.some((r) => r.id === r1.id));

  const moved = new Date(realNow.getTime() - 30 * 60_000);
  await db.update(crmReminders).set({ remindAt: moved }).where(eq(crmReminders.id, r1.id));
  rows = (await cron.dueReminders(realNow)).filter((r) => r.assignedTo === userId);
  check("напоминание перенесли - выбирается снова", rows.some((r) => r.id === r1.id));

  await db.update(crmReminders).set({ isCompleted: true }).where(eq(crmReminders.id, r1.id));
  rows = (await cron.dueReminders(realNow)).filter((r) => r.assignedTo === userId);
  check("выполненное не выбирается", !rows.some((r) => r.id === r1.id));

  // Задачи
  const inTenHours = new Date(realNow.getTime() + 10 * HOUR);
  const [t1] = await db
    .insert(tasks)
    .values({ title: "Проверка срока", assignedTo: userId, createdBy: userId, dueDate: inTenHours })
    .returning({ id: tasks.id });
  const [t2] = await db
    .insert(tasks)
    .values({ title: "Далеко", assignedTo: userId, createdBy: userId, dueDate: new Date(realNow.getTime() + 5 * DAY) })
    .returning({ id: tasks.id });
  const [t3] = await db
    .insert(tasks)
    .values({ title: "Сделана", assignedTo: userId, createdBy: userId, dueDate: inTenHours, status: "completed" })
    .returning({ id: tasks.id });

  let trows = (await cron.dueTasks(realNow)).filter((t) => t.assignedTo === userId);
  check("задача со сроком завтра попала в выборку", trows.some((t) => t.id === t1.id));
  check("далёкая задача - нет", !trows.some((t) => t.id === t2.id));
  check("выполненная - нет", !trows.some((t) => t.id === t3.id));

  await db.update(tasks).set({ notifiedDueDate: trows.find((t) => t.id === t1.id).dueDate }).where(eq(tasks.id, t1.id));
  trows = (await cron.dueTasks(realNow)).filter((t) => t.assignedTo === userId);
  check("после отметки второй раз не выбирается", !trows.some((t) => t.id === t1.id));

  await db.update(tasks).set({ dueDate: new Date(inTenHours.getTime() + HOUR) }).where(eq(tasks.id, t1.id));
  trows = (await cron.dueTasks(realNow)).filter((t) => t.assignedTo === userId);
  check("срок задачи передвинули - выбирается снова", trows.some((t) => t.id === t1.id));

  // Клиент не может быть исполнителем уведомлений
  await db.update(users).set({ role: "user" }).where(eq(users.id, userId));
  await db.update(crmReminders).set({ isCompleted: false, notifiedRemindAt: null }).where(eq(crmReminders.id, r1.id));
  rows = (await cron.dueReminders(realNow)).filter((r) => r.assignedTo === userId);
  trows = (await cron.dueTasks(realNow)).filter((t) => t.assignedTo === userId);
  check("исполнитель не из сотрудников - не уведомляем", rows.length === 0 && trows.length === 0);
  await db.update(users).set({ role: "manager" }).where(eq(users.id, userId));

  // Уборка: «сейчас» отодвинуто на 300 суток назад, чтобы под нож не попали
  // чужие записи dev-базы, - удаляется только строка старше 301 суток
  const longAgo = new Date(realNow.getTime() - 400 * DAY);
  const pretendNow = new Date(realNow.getTime() - 300 * DAY);
  await db.insert(rateLimits).values([
    { identifier: "check-cron:old", action: "login", attemptedAt: longAgo },
    { identifier: "check-cron:new", action: "login", attemptedAt: new Date(pretendNow.getTime() - HOUR) },
  ]);
  const cleaned = await cron.cleanRateLimits(pretendNow);
  const left = await db
    .select({ identifier: rateLimits.identifier })
    .from(rateLimits)
    .where(like(rateLimits.identifier, "check-cron:%"));
  check("старая запись журнала лимитов убрана", cleaned >= 1 && !left.some((x) => x.identifier === "check-cron:old"));
  check("свежая запись осталась", left.some((x) => x.identifier === "check-cron:new"));

  await db.insert(telegramLinkCodes).values([
    { userId, codeHash: "check-cron-expired".padEnd(64, "0"), expiresAt: new Date(realNow.getTime() - HOUR) },
    { userId, codeHash: "check-cron-alive".padEnd(64, "0"), expiresAt: new Date(realNow.getTime() + HOUR) },
  ]);
  await cron.cleanTelegramLinkCodes(realNow);
  const codes = await db
    .select({ hash: telegramLinkCodes.codeHash })
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.userId, userId));
  check("просроченный код привязки убран", !codes.some((c) => c.hash.startsWith("check-cron-expired")));
  check("действующий код остался", codes.some((c) => c.hash.startsWith("check-cron-alive")));

  // Блокировка: пока другое соединение держит её, проход не начинается
  const lockClient = await db.$client.connect();
  try {
    await lockClient.query("begin");
    const { rows: got } = await lockClient.query("select pg_try_advisory_xact_lock(4220017001::bigint) as locked");
    check("тестовое соединение взяло блокировку", got[0].locked === true);
    const report = await cron.runCron();
    check("при занятой блокировке проход ничего не делает", report.ran === false && report.reason === "locked");
  } finally {
    await lockClient.query("rollback");
    lockClient.release();
  }
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  await cleanup();
}

const leftovers = await db.select({ id: users.id }).from(users).where(eq(users.email, MARK));
const leftLimits = await db.select({ id: rateLimits.id }).from(rateLimits).where(like(rateLimits.identifier, "check-cron:%"));
check("тестовые строки удалены", leftovers.length === 0 && leftLimits.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
await db.$client.end();
