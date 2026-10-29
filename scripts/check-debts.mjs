/**
 * Проверка контроля долгов и акта сверки.
 *
 *   npm run check:debts
 *
 * Чистая часть: возраст долга и корзины, дата готовности по истории
 * статусов, ключ плательщика, свёртка акта сверки (сальдо, границы
 * периода по поясу отчётов). Часть с базой заводит свои строки с пометкой,
 * читает долги и акт и убирает за собой; задача планировщика проверена в
 * check:cron. Ничего никому не отправляется.
 */
import { readFileSync } from "node:fs";
import { databaseUrl } from "./db-url.mjs";

process.env.DATABASE_URL = databaseUrl();

const d = await import("../src/lib/debts.ts");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ---------------------------------------------------- возраст в днях

// Екатеринбург = UTC+5. 23:30 по-местному 10 июня и 08:30 следующего дня:
// девять часов, но календарный день уже другой
const lateEvening = new Date("2026-06-10T18:30:00Z");
const nextMorning = new Date("2026-06-11T03:30:00Z");
check("девять часов через полночь - уже один день", d.debtAgeDays(lateEvening, nextMorning) === 1);
check("в тот же день - ноль", d.debtAgeDays(new Date("2026-06-10T01:00:00Z"), new Date("2026-06-10T18:00:00Z")) === 0);
check("ровно шесть календарных дней", d.debtAgeDays(new Date("2026-06-01T10:00:00Z"), new Date("2026-06-07T10:00:00Z")) === 6);
check("будущая дата не даёт отрицательный возраст", d.debtAgeDays(new Date("2026-06-12T10:00:00Z"), new Date("2026-06-10T10:00:00Z")) === 0);

// ----------------------------------------------------------- корзины

const bucketAt = (n) => d.debtBucket(n);
check("0 и 5 дней - первая корзина", bucketAt(0) === "fresh" && bucketAt(5) === "fresh");
check("6 и 14 дней - вторая корзина", bucketAt(6) === "mid" && bucketAt(14) === "mid");
check("15 и больше - третья корзина", bucketAt(15) === "old" && bucketAt(400) === "old");
check("порог задачи - 6 дней, порог предупреждения - 15", d.DEBT_TASK_AGE_DAYS === 6 && d.DEBT_WARN_AGE_DAYS === 15);

const lines = [
  { debt: 100, ageDays: 2 },
  { debt: 200.1, ageDays: 6 },
  { debt: 0.2, ageDays: 14 },
  { debt: 300, ageDays: 15 },
  { debt: 50, ageDays: null },
];
const totals = d.bucketTotals(lines);
check(
  "сводка по корзинам, не готовые не считаются",
  totals.fresh.n === 1 && totals.fresh.sum === 100 && totals.mid.n === 2 && totals.mid.sum === 200.3 && totals.old.n === 1,
  JSON.stringify(totals),
);
const warn = d.overdueWarning(lines);
check("предупреждение: только 15+, сумма", warn?.n === 1 && warn.sum === 300);
check("нет просрочки 15+ - нет предупреждения", d.overdueWarning([{ debt: 10, ageDays: 14 }]) === null);

// ------------------------------------------------ дата готовности

const t = (iso) => new Date(iso);
const created = t("2026-01-01T10:00:00Z");
const start = (currentStatus, events) => d.debtStart({ currentStatus, events, createdAt: created });

check("заказ в работе - отсчёта нет", start("in_work", [{ at: t("2026-02-01T00:00:00Z"), to: "ready" }]) === null);
check("отменённый и без статуса - отсчёта нет", start("cancelled", []) === null && start(null, []) === null);
{
  const r = start("completed", [{ at: t("2026-03-05T10:00:00Z"), to: "ready" }]);
  check("дата из журнала, точная", r?.since.toISOString() === "2026-03-05T10:00:00.000Z" && r.approximate === false);
}
{
  const r = start("completed", []);
  check("нет записей - дата заказа и пометка «приблизительно»", r?.since.getTime() === created.getTime() && r.approximate === true);
}
{
  // ready -> shipped -> completed: отсчёт с первого «готов», а не с последнего статуса
  const r = start("completed", [
    { at: t("2026-03-09T10:00:00Z"), to: "shipped" },
    { at: t("2026-03-05T10:00:00Z"), to: "ready" },
    { at: t("2026-03-12T10:00:00Z"), to: "completed" },
  ]);
  check("цепочка готов-отправлен-завершён: с первого готового, порядок записей неважен", r?.since.toISOString() === "2026-03-05T10:00:00.000Z");
}
{
  // вернули в работу и закончили заново - это уже другая готовность
  const r = start("ready", [
    { at: t("2026-03-05T10:00:00Z"), to: "ready" },
    { at: t("2026-03-07T10:00:00Z"), to: "in_work" },
    { at: t("2026-03-20T10:00:00Z"), to: "ready" },
  ]);
  check("возврат в работу обнуляет отсчёт", r?.since.toISOString() === "2026-03-20T10:00:00.000Z" && !r.approximate);
}
{
  // журнал говорит «вернули в работу», а статус сейчас готов (правили в обход) - честно «приблизительно»
  const r = start("ready", [
    { at: t("2026-03-05T10:00:00Z"), to: "ready" },
    { at: t("2026-03-07T10:00:00Z"), to: "in_work" },
  ]);
  check("журнал противоречит статусу - приблизительно", r?.approximate === true);
}

check("статус из журнала: заказ сайта", d.statusFromAudit("order.status", { from: "in_work", status: "ready" }) === "ready");
check("статус из журнала: заказ менеджера", d.statusFromAudit("external_order.production_status", { from: "ready", to: "shipped" }) === "shipped");
check("статус из журнала: старый сайт", d.statusFromAudit("order.status_change", { new_status: "completed", old_status: "x" }) === "completed");
check("чужое действие и кривые данные - не статус", d.statusFromAudit("order.urgent", { status: "ready" }) === null && d.statusFromAudit("order.status", null) === null && d.statusFromAudit("order.status", { status: 5 }) === null);

// ------------------------------------------------ задача по долгу

const due = (o = {}) => ({ debt: 100, ageDays: 6, approximate: false, taskAt: null, ...o });
check("шесть дней, точная дата - задача нужна", d.isDebtTaskDue(due()));
check("пять дней - рано", !d.isDebtTaskDue(due({ ageDays: 5 })));
check("уже заводили - второй раз нет", !d.isDebtTaskDue(due({ taskAt: new Date() })));
check("приблизительная дата - задачу не заводим", !d.isDebtTaskDue(due({ approximate: true, ageDays: 300 })));
check("не готов (возраста нет) - не заводим", !d.isDebtTaskDue(due({ ageDays: null })));
check("долг погашен - не заводим", !d.isDebtTaskDue(due({ debt: 0 })));

// ------------------------------------------------ чей это долг

const linked = new Map([[7, 3]]);
const key = (o) => d.partyKeyOf({ counterpartyByUser: linked, userId: null, clientId: null, clientName: null, ...o });
check("заказ менеджера с контрагентом - по контрагенту", key({ source: "external", clientId: 5, clientName: "Имя" }) === "c:5");
check("заказ менеджера без контрагента - по имени без регистра и лишних пробелов", key({ source: "external", clientName: "  ООО   Ромашка " }) === "n:ооо ромашка");
check("пустое имя - плательщика нет", key({ source: "external", clientName: "   " }) === null);
check("заказ сайта клиента с контрагентом - по контрагенту", key({ source: "site", userId: 7 }) === "c:3");
check("заказ сайта без контрагента - по клиенту", key({ source: "site", userId: 8 }) === "u:8");
check("ключ разбирается обратно", JSON.stringify(d.parsePartyKey("c:12")) === '{"kind":"counterparty","id":12}' && d.parsePartyKey("u:4")?.kind === "user");
check("ключ по имени нормализуется", d.parsePartyKey("n:  Ромашка  ООО")?.name === "ромашка ооо");
check(
  "мусор вместо ключа отвергается",
  ["", "c:", "c:0", "c:-1", "c:1e3", "c:99999999999", "x:1", "c:1 or 1=1", null, 5, "n:   "].every((v) => d.parsePartyKey(v) === null),
);
check("ссылка на долги кодирует ключ", d.partyHref("n:а б") === "/admin/finance/debts?party=n%3A%D0%B0%20%D0%B1");

// ------------------------------------------------------- акт сверки

check("начало дня по поясу отчётов", d.reportDayStart("2026-06-01").toISOString() === "2026-05-31T19:00:00.000Z");
{
  const r = d.reconciliationRange("2026-06-01", "2026-06-30");
  check("конец периода - начало следующих суток", r.toExclusive.toISOString() === "2026-06-30T19:00:00.000Z");
  check("следующий день через границу месяца и года", d.nextDay("2026-06-30") === "2026-07-01" && d.nextDay("2026-12-31") === "2027-01-01");
}

const range = d.reconciliationRange("2026-06-01", "2026-06-30");
const act = d.reconcile({
  ...range,
  charges: [
    { at: t("2026-05-20T10:00:00Z"), amount: 1000, label: "до периода", approximate: false },
    { at: t("2026-06-10T10:00:00Z"), amount: 500.1, label: "в периоде", approximate: false },
    { at: t("2026-06-30T18:59:00Z"), amount: 200.2, label: "последняя минута 30 июня", approximate: true },
    { at: t("2026-06-30T19:00:00Z"), amount: 999, label: "уже июль", approximate: false },
  ],
  payments: [
    { at: t("2026-05-25T10:00:00Z"), amount: 300, label: "аванс" },
    { at: t("2026-06-10T10:00:00Z"), amount: 100, label: "в тот же миг, что и начисление" },
    { at: t("2026-06-20T10:00:00Z"), amount: 0.3, label: "копейки" },
  ],
});
check("сальдо на начало = начисления минус оплаты до периода", act.opening === 700);
check("обороты за период, без хвоста копеек", act.charged === 700.3 && act.paid === 100.3, `${act.charged} / ${act.paid}`);
check("сальдо на конец = начало + начислено - оплачено", act.closing === 1300, String(act.closing));
check("июльская операция в акт не вошла", !act.rows.some((r) => r.label === "уже июль"));
check("при равной дате начисление идёт раньше оплаты", act.rows[0].charge > 0 && act.rows[1].payment > 0);
check("приблизительность начисления переходит в строку", act.rows.find((r) => r.label.startsWith("последняя")).approximate === true);
{
  const adv = d.reconcile({ ...range, charges: [], payments: [{ at: t("2026-05-25T10:00:00Z"), amount: 300, label: "аванс" }] });
  check("аванс даёт отрицательное сальдо (должны мы)", adv.opening === -300 && adv.closing === -300);
  const sums = d.reconcile({
    ...range,
    charges: [{ at: t("2026-06-02T10:00:00Z"), amount: 0.1, label: "a", approximate: false }, { at: t("2026-06-03T10:00:00Z"), amount: 0.2, label: "b", approximate: false }],
    payments: [],
  });
  check("0.1 + 0.2 в акте равно 0.3", sums.closing === 0.3);
}
{
  const p = d.defaultActPeriod(new Date("2026-10-29T10:00:00Z"));
  check("период по умолчанию - с начала года по сегодня", p.from === "2026-01-01" && p.to === "2026-10-29");
}

// ------------------------------------------------- проводка в коде

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
check("планировщик заводит задачи по долгам", /runTask\("debt-tasks"/.test(read("src/lib/cron-db.ts")));
check("карточка заказа с сайта показывает предупреждение", read("src/app/admin/orders/[id]/page.tsx").includes("<OrderDebtWarning"));
check("карточка заказа менеджера показывает предупреждение", read("src/app/admin/external-orders/[id]/page.tsx").includes("<OrderDebtWarning"));
check("форма нового заказа менеджера показывает предупреждение", read("src/app/admin/external-orders/new/OrderForm.tsx").includes("<DebtWarning"));
check("страница долгов и акт требуют право смотреть финансы", /can\("finance", "view"\)/.test(read("src/app/admin/finance/debts/page.tsx")) && /can\("finance", "view"\)/.test(read("src/app/print/reconciliation/page.tsx")));
check("пункт «Долги» есть в меню", read("src/components/admin/AdminNav.tsx").includes('"/admin/finance/debts"'));
check("предупреждение ничего не блокирует: в действиях создания заказа долгов нет", !/debts/.test(read("src/app/actions/external-orders.ts")));

// ---------------------------------------------------------- с базой

const { and, eq, inArray, like } = await import("drizzle-orm");
const { db } = await import("@/db");
const { auditLog, clients, externalOrders, orderPayments, orders, ordersAccounting, users } = await import("@/db/schema");
const dbl = await import("../src/lib/debts-db.ts");
const { localDate } = await import("../src/lib/dates.ts");

const MARK = "proverka-debts@example.invalid";
const NAME = "Проверка долгов (ООО Тест)";
const created_ = { clients: [], ext: [], site: [], cards: [], users: [] };

async function cleanup() {
  const staleUsers = await db.select({ id: users.id }).from(users).where(like(users.email, "proverka-debts%"));
  const uids = [...new Set([...staleUsers.map((u) => u.id), ...created_.users])];
  const staleExt = await db.select({ id: externalOrders.id }).from(externalOrders).where(like(externalOrders.clientName, "Проверка долгов%"));
  const extIds = [...new Set([...staleExt.map((e) => e.id), ...created_.ext])];

  if (extIds.length > 0) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, "external_order"), inArray(auditLog.entityId, extIds)));
  }
  if (uids.length > 0) {
    const siteOrders = await db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, uids));
    const siteIds = siteOrders.map((o) => o.id);
    if (siteIds.length > 0) await db.delete(ordersAccounting).where(inArray(ordersAccounting.orderId, siteIds));
    if (siteIds.length > 0) await db.delete(orders).where(inArray(orders.id, siteIds));
  }
  if (extIds.length > 0) {
    await db.delete(ordersAccounting).where(inArray(ordersAccounting.externalOrderId, extIds));
    await db.delete(externalOrders).where(inArray(externalOrders.id, extIds));
  }
  await db.delete(clients).where(like(clients.name, "Проверка долгов%"));
  if (uids.length > 0) await db.delete(users).where(inArray(users.id, uids));
}

try {
  await cleanup();
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * DAY);

  const [staff] = await db
    .insert(users)
    .values({ email: MARK, name: "Проверка долгов: менеджер", password: "x", role: "manager" })
    .returning({ id: users.id });
  created_.users.push(staff.id);
  const [client] = await db
    .insert(users)
    .values({ email: "proverka-debts-client@example.invalid", name: "Проверка долгов: клиент", password: "x", role: "user" })
    .returning({ id: users.id });
  created_.users.push(client.id);

  const [cp] = await db.insert(clients).values({ name: NAME, userId: client.id }).returning({ id: clients.id });

  async function ext({ status, income, createdDaysAgo, paid = 0, paidDaysAgo = 0, cancelled = false, readyDaysAgo = null }) {
    const [o] = await db
      .insert(externalOrders)
      .values({ clientId: cp.id, clientName: NAME, productionStatus: status, totalPrice: String(income), createdAt: ago(createdDaysAgo) })
      .returning({ id: externalOrders.id });
    created_.ext.push(o.id);
    const [card] = await db
      .insert(ordersAccounting)
      .values({ source: "external", externalOrderId: o.id, clientName: NAME, income: String(income), isCancelled: cancelled })
      .returning({ id: ordersAccounting.id });
    created_.cards.push(card.id);
    if (paid > 0) {
      await db.insert(orderPayments).values({ orderAccountingId: card.id, amount: String(paid), paymentDate: ago(paidDaysAgo) });
    }
    if (readyDaysAgo !== null) {
      await db.insert(auditLog).values({
        userId: staff.id,
        action: "external_order.production_status",
        entityType: "external_order",
        entityId: o.id,
        details: { from: "in_work", to: "ready" },
        createdAt: ago(readyDaysAgo),
      });
    }
    return { orderId: o.id, cardId: card.id };
  }

  const e1 = await ext({ status: "completed", income: 1000, createdDaysAgo: 30, paid: 300, paidDaysAgo: 28, readyDaysAgo: 7 });
  const e2 = await ext({ status: "completed", income: 500, createdDaysAgo: 20 });
  const e3 = await ext({ status: "in_work", income: 200, createdDaysAgo: 3 });
  const e4 = await ext({ status: "cancelled", income: 100, createdDaysAgo: 40, paid: 50, paidDaysAgo: 38, cancelled: true });

  // Заказ с сайта клиента, к аккаунту которого привязан контрагент
  const [site] = await db
    .insert(orders)
    .values({ userId: client.id, totalPrice: "400", shippingAddress: "x", contactInfo: "{}", status: "shipped", createdAt: ago(5) })
    .returning({ id: orders.id });
  created_.site.push(site.id);
  await db.insert(ordersAccounting).values({ source: "site", orderId: site.id, clientName: NAME, income: "400" });

  check("клиент сайта с привязанным контрагентом - плательщик контрагент", (await dbl.partyKeyForUser(client.id)) === `c:${cp.id}`);
  check("заказ менеджера без контрагента - по имени", dbl.partyKeyForExternal(null, " Проверка  ДОЛГОВ ") === "n:проверка долгов");

  const party = `c:${cp.id}`;
  const list = await dbl.loadDebtOrders({ now, partyKey: party });
  const by = (id, src = "external") => list.find((o) => o.orderId === id && o.source === src);

  check("долги плательщика: три заказа менеджера и заказ сайта, отменённого нет", list.length === 4 && !by(e4.orderId), list.map((o) => o.number).join(","));
  check("долг = доход - платежи", by(e1.orderId)?.debt === 700 && by(e2.orderId)?.debt === 500);
  check("точная дата готовности из журнала", by(e1.orderId)?.ageDays === 7 && by(e1.orderId)?.approximate === false);
  check("без записи в журнале - дата заказа, приблизительно", by(e2.orderId)?.ageDays === 20 && by(e2.orderId)?.approximate === true);
  check("заказ в работе - без возраста", by(e3.orderId)?.ageDays === null);
  check("номер заказа менеджера с буквой, ссылка", by(e1.orderId)?.number === `${e1.orderId}-М` && by(e1.orderId)?.href === `/admin/external-orders/${e1.orderId}`);
  check("заказ сайта: плательщик тот же контрагент", by(site.id, "site")?.partyKey === party);
  check("ответственный - сотрудник, последним трогавший заказ", by(e1.orderId)?.responsibleId === staff.id);

  const w = await dbl.overdueDebtOf(party, now);
  check("предупреждение: заказ старше 15 дней (приблизительный тоже виден)", w?.n === 1 && w.sum === 500, JSON.stringify(w));
  const byCp = await dbl.overdueDebtByCounterparty(now);
  check("предупреждения для формы нового заказа по контрагентам", byCp[cp.id]?.sum === 500);
  check("чужой плательщик без долга - предупреждения нет", (await dbl.overdueDebtOf("c:2147483000", now)) === null);

  const debtors = dbl.groupDebtors(list);
  check("должники сгруппированы: один плательщик, самый старый заказ", debtors.length === 1 && debtors[0].oldestAge === 20 && debtors[0].debt === 1800 && debtors[0].orders.length === 4, `${debtors[0]?.debt}`);

  // Акт сверки за период: последние 10 суток
  const fromDay = localDate(ago(10));
  const toDay = localDate(now);
  const rec = await dbl.loadReconciliation(party, d.reconciliationRange(fromDay, toDay));
  // до периода: e2 (+500, приблизительно), e1 оплата -300, e4 оплата -50 (отменён, деньги получены),
  //             заказ e1 начислен 7 суток назад - внутри периода (+1000), заказ сайта shipped, createdAt 5 суток - внутри (+400)
  check("акт: плательщик и приблизительность", rec?.partyKey === party && rec.hasApproximate === true);
  check("акт: сальдо на начало учитывает оплату по отменённому заказу", rec?.opening === 150, String(rec?.opening));
  check("акт: начисления в периоде - готовые и не отменённые", rec?.charged === 1400, String(rec?.charged));
  check("акт: сальдо на конец", rec?.closing === 1550, String(rec?.closing));
  check("акт: строки по датам", rec?.rows.length === 2 && rec.rows[0].at <= rec.rows[1].at);
  check("акт для несуществующего плательщика пуст", (await dbl.loadReconciliation("c:2147483000", d.reconciliationRange(fromDay, toDay))) === null);
  const byName = await dbl.loadReconciliation("n:не существует", d.reconciliationRange(fromDay, toDay));
  check("акт по неизвестному имени пуст", byName === null);
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  await cleanup();
}

const left = await db.select({ id: users.id }).from(users).where(like(users.email, "proverka-debts%"));
const leftClients = await db.select({ id: clients.id }).from(clients).where(like(clients.name, "Проверка долгов%"));
const leftOrders = await db.select({ id: externalOrders.id }).from(externalOrders).where(like(externalOrders.clientName, "Проверка долгов%"));
check("тестовые строки удалены", left.length === 0 && leftClients.length === 0 && leftOrders.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
await db.$client.end();
