/**
 * Проверки денег заказа: итог, карточка бухгалтерии, статус оплаты.
 *
 *   npm run check:money
 *
 * Правила живут в src/lib/order-money.ts (чистые) и
 * src/lib/order-money-db.ts (единый пересчёт). Здесь - чистые тесты и
 * сценарии на настоящей базе: заказ, платёж, новая позиция, срочность,
 * списание, отмена, сверка Точки, удаление. Именно в этих местах деньги
 * раньше расходились.
 *
 * Скрипт заводит свои строки и убирает их за собой.
 */
import { databaseUrl } from "./db-url.mjs";

// В контейнере .env нет - адрес приходит окружением; db-url.mjs знает оба случая
process.env.DATABASE_URL = databaseUrl();

const { eq, inArray, sql } = await import("drizzle-orm");
const { db } = await import("@/db");
const {
  users,
  orders,
  orderItems,
  externalOrders,
  externalOrderItems,
  ordersAccounting,
  orderExpenses,
  orderPayments,
  productionOrders,
  materials,
  materialsStock,
  tochkaInvoices,
} = await import("@/db/schema");
const money = await import("@/lib/order-money");
const status = await import("@/lib/order-status");
const { lastMonths, reportMonthStart } = await import("@/lib/analytics");
const svc = await import("@/lib/order-money-db");
const { taxRate } = await import("@/lib/accounting-db");
const { applyMovement } = await import("@/lib/stock");

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;

// ------------------------------------------------------------ чистые правила

console.log("Чистые правила");
const { paymentStatusOf, effectiveExpense, siteOrderTotal, externalOrderTotal, debtOf } = money;
check("без платежей - не оплачен", paymentStatusOf(1000, 0) === "unpaid");
check("часть суммы - частично", paymentStatusOf(1000, 400) === "partial");
check("вся сумма - оплачен", paymentStatusOf(1000, 1000) === "paid");
check("копейка недоплаты из-за округления - всё равно оплачен", paymentStatusOf(1000, 999.996) === "paid");
check("недоплата в копейку - частично", paymentStatusOf(1000, 999.99) === "partial");
check("переплата - оплачен", paymentStatusOf(1000, 1500) === "paid");
check("нулевой заказ без платежей - не оплачен", paymentStatusOf(0, 0) === "unpaid");
check("долг не уходит в минус при переплате", debtOf(1000, 1500) === 0);
check("долг = доход − платежи", debtOf(1000, 400) === 600);

const auto = { amount: 300, description: money.AUTO_EXPENSE, isWriteOff: false };
const legacy = { amount: 50, description: money.LEGACY_AUTO_EXPENSE[0], isWriteOff: false };
const manual = { amount: 100, description: "Доставка", isWriteOff: false };
const fact = { amount: 120, description: "Списано со склада: плёнка", isWriteOff: true };
check("без списаний оценка входит в расход", effectiveExpense([auto, manual]) === 400);
check("со списанием оценка не входит (факт вытесняет)", effectiveExpense([auto, legacy, manual, fact]) === 220);

const t1 = siteOrderTotal({ subtotal: 1000, urgent: true, discount: 100 });
check("сайт: срочность +50 %, скидка фиксированная", t1.fee === 500 && t1.total === 1400);
check("сайт: итог не уходит ниже нуля", siteOrderTotal({ subtotal: 100, urgent: false, discount: 500 }).total === 0);
check("менеджер: позиции + корректировка", externalOrderTotal(1000, -150) === 850);
check("менеджер: итог не ниже нуля", externalOrderTotal(100, -500) === 0);

check("переход pending → cancelled разрешён", status.canChangeStatus("pending", "cancelled"));
check("переход completed → pending запрещён", !status.canChangeStatus("completed", "pending"));
check("из отмены - только в pending/processing", status.canChangeStatus("cancelled", "processing") && !status.canChangeStatus("cancelled", "shipped"));
check("тот же статус - не ошибка", status.canChangeStatus("in_work", "in_work"));
check("constructor - не статус", !status.isOrderStatus("constructor"));
check(
  "начало месяца - полночь по Екатеринбургу (UTC+5)",
  reportMonthStart("2026-10").toISOString() === "2026-09-30T19:00:00.000Z",
);
check(
  "1 октября 01:00 по Екатеринбургу - уже октябрь, хотя в UTC ещё сентябрь",
  lastMonths(1, new Date("2026-09-30T20:00:00Z"))[0] === "2026-10",
);
check(
  "у каждого статуса есть строка переходов, и все цели - статусы",
  Object.keys(status.ORDER_STATUS).every(
    (k) => Array.isArray(status.ORDER_TRANSITIONS[k]) && status.ORDER_TRANSITIONS[k].every((t) => status.isOrderStatus(t)),
  ),
);

// ------------------------------------------------------------ сценарии в базе

const MARK = "money-check@check.invalid";
let userId = null;
let siteId = null;
let extId = null;
let ext2Id = null;
let materialId = null;
let invoiceId = null;

const cardOf = async (ref) => {
  const [c] = await db
    .select()
    .from(ordersAccounting)
    .where(ref.source === "site" ? eq(ordersAccounting.orderId, ref.id) : eq(ordersAccounting.externalOrderId, ref.id))
    .limit(1);
  return c;
};

try {
  const rate = await taxRate(db);
  const [u] = await db
    .insert(users)
    .values({ name: "Проверка денег", email: MARK, password: "x", role: "user" })
    .returning({ id: users.id });
  userId = u.id;

  // ---- заказ с сайта
  console.log("\nЗаказ с сайта");
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      totalPrice: "0.00",
      shippingAddress: "-",
      contactInfo: JSON.stringify({ name: "Проверка денег", is_urgent: false, promo_data: null }),
    })
    .returning({ id: orders.id });
  siteId = o.id;
  const site = { source: "site", id: siteId };

  await db.insert(orderItems).values([
    { orderId: siteId, itemName: "Тест", isCustom: true, quantity: 1, unitPrice: "500.00", price: "500.00" },
    { orderId: siteId, itemName: "Тест 2", isCustom: true, quantity: 1, unitPrice: "500.00", price: "500.00" },
  ]);
  let s = await db.transaction((tx) => svc.recalcOrderMoney(tx, site, { rebuildTotal: true, refreshEstimate: true }));
  check("карточка заведена, доход = сумма позиций", s && near(s.income, 1000), `доход ${s?.income}`);
  check("без платежей - не оплачен", s.status === "unpaid");

  let r = await db.transaction((tx) => svc.addOrderPayment(tx, s.cardId, { amount: 400, paidAt: new Date() }));
  check("частичный платёж → partial", r.summary.status === "partial");
  r = await db.transaction((tx) => svc.addOrderPayment(tx, s.cardId, { amount: 600, paidAt: new Date() }));
  check("доплата → paid", r.summary.status === "paid");

  s = await db.transaction(async (tx) => {
    await tx.insert(orderItems).values({ orderId: siteId, itemName: "Ещё", isCustom: true, quantity: 1, unitPrice: "300.00", price: "300.00" });
    return svc.recalcOrderMoney(tx, site, { rebuildTotal: true, refreshEstimate: true });
  });
  check("новая позиция в оплаченном заказе → partial", s.status === "partial" && near(s.income, 1300), `${s.status}, ${s.income}`);

  s = await db.transaction((tx) => svc.setSiteOrderUrgent(tx, siteId, true));
  check("срочность меняет итог (+50 %)", near(s.income, 1950), `доход ${s.income}`);
  check("и налог от нового итога", near(s.tax, Math.round(1950 * rate) / 100), `налог ${s.tax}`);
  const [urgentOrder] = await db.select().from(orders).where(eq(orders.id, siteId));
  check("итог заказа совпадает с доходом карточки", near(urgentOrder.totalPrice, 1950));
  check("contact_info помнит срочность", JSON.parse(urgentOrder.contactInfo).is_urgent === true && JSON.parse(urgentOrder.contactInfo).urgent_fee === 650);
  s = await db.transaction((tx) => svc.setSiteOrderUrgent(tx, siteId, false));
  check("снятие срочности возвращает итог", near(s.income, 1300) && near(s.tax, Math.round(1300 * rate) / 100));

  // ---- отмена
  console.log("\nОтмена");
  const [po] = await db
    .insert(productionOrders)
    .values({ orderId: siteId, status: "in_progress" })
    .returning({ id: productionOrders.id });
  const res = await db.transaction((tx) => svc.changeOrderStatus(tx, site, "cancelled"));
  check("pending → cancelled прошёл", res.changed === true);
  let card = await cardOf(site);
  check("карточка помечена отменённой", card.isCancelled === true);
  let [poRow] = await db.select().from(productionOrders).where(eq(productionOrders.id, po.id));
  check("производство отменено", poRow.status === "cancelled");
  const same = await db.transaction((tx) => svc.changeOrderStatus(tx, site, "cancelled"));
  check("тот же статус - без изменений (и без письма)", same.changed === false);
  let refused = false;
  try {
    await db.transaction((tx) => svc.changeOrderStatus(tx, site, "shipped"));
  } catch (e) {
    refused = e instanceof svc.MoneyRuleError;
  }
  check("cancelled → shipped запрещён", refused);
  await db.transaction((tx) => svc.changeOrderStatus(tx, site, "pending"));
  card = await cardOf(site);
  [poRow] = await db.select().from(productionOrders).where(eq(productionOrders.id, po.id));
  check("снятие отмены возвращает карточку в выручку", card.isCancelled === false);
  check("и ставит производство на паузу", poRow.status === "on_hold");

  // ---- параллельные платежи: раньше ловили взаимную блокировку (вставка
  // платежа держит KEY SHARE на карточке, пересчёт брал FOR UPDATE)
  console.log("\nПараллельные платежи");
  const cardBefore = await cardOf(site);
  const [{ paid: paidBefore }] = (
    await db.execute(
      sql`select coalesce(sum(amount), 0)::float8 as paid from order_payments where order_accounting_id = ${cardBefore.id}`,
    )
  ).rows;
  const parallel = await Promise.allSettled([
    db.transaction((tx) => svc.addOrderPayment(tx, cardBefore.id, { amount: 10, paidAt: new Date() })),
    db.transaction((tx) => svc.addOrderPayment(tx, cardBefore.id, { amount: 15, paidAt: new Date() })),
  ]);
  const failedParallel = parallel.filter((p) => p.status === "rejected");
  check(
    "два платежа разом - оба прошли",
    failedParallel.length === 0,
    failedParallel.map((p) => String(p.reason?.message ?? p.reason)).join("; "),
  );
  const cardAfter = await cardOf(site);
  const [{ paid: paidAfter }] = (
    await db.execute(
      sql`select coalesce(sum(amount), 0)::float8 as paid from order_payments where order_accounting_id = ${cardBefore.id}`,
    )
  ).rows;
  check("сумма платежей верна", near(paidAfter - paidBefore, 25), `+${paidAfter - paidBefore}`);
  check(
    "статус карточки посчитан по обоим платежам",
    cardAfter.status === money.paymentStatusOf(Number(cardAfter.income), paidAfter),
    cardAfter.status,
  );

  // ---- платёж не пересобирает итог: он зафиксирован при оформлении
  const frozen = await db.transaction(async (tx) => {
    await tx.update(orders).set({ totalPrice: "1299.00" }).where(eq(orders.id, siteId));
    return svc.recalcOrderMoney(tx, site);
  });
  check("без правки позиций итог берётся сохранённый", near(frozen.income, 1299));
  const rebuilt = await db.transaction((tx) => svc.recalcOrderMoney(tx, site, { rebuildTotal: true }));
  check("правка позиций пересобирает итог", near(rebuilt.income, 1300));

  // ---- сверка Точки
  console.log("\nСверка Точки");
  const [inv] = await db
    .insert(tochkaInvoices)
    .values({ documentId: `money-check-${Date.now()}`, orderId: siteId, amount: "300.00", paymentStatus: "paid", paidAt: new Date() })
    .returning({ id: tochkaInvoices.id });
  invoiceId = inv.id;
  const first = await db.transaction((tx) => svc.applyPaidTochkaInvoice(tx, invoiceId));
  const second = await db.transaction((tx) => svc.applyPaidTochkaInvoice(tx, invoiceId));
  const byInvoice = await db.select().from(orderPayments).where(eq(orderPayments.tochkaInvoiceId, invoiceId));
  check("оплаченный счёт стал платежом", first?.paymentId != null);
  check("повторная сверка платёж не дублирует", second?.paymentId == null && byInvoice.length === 1);
  check("после оплаты счёта заказ оплачен", second.summary.status === "paid", second.summary.status);

  // ---- заказ менеджера
  console.log("\nЗаказ менеджера");
  const [e] = await db
    .insert(externalOrders)
    .values({ clientName: "Проверка денег", totalPrice: "0.00" })
    .returning({ id: externalOrders.id });
  extId = e.id;
  const ext = { source: "external", id: extId };
  await db.insert(externalOrderItems).values({
    externalOrderId: extId,
    isCustom: true,
    itemName: "Тест",
    quantity: 2,
    price: "1000.00",
    expenseAmount: "300.00",
  });
  // Как createExternalOrder с «оплачено полностью»: пересчёт и платёж на итог
  const created = await db.transaction(async (tx) => {
    const c = await svc.recalcOrderMoney(tx, ext, { rebuildTotal: true, refreshEstimate: true });
    return (await svc.addOrderPayment(tx, c.cardId, { amount: c.income, paidAt: new Date(), note: "Оплата при оформлении заказа" })).summary;
  });
  let [eRow] = await db.select().from(externalOrders).where(eq(externalOrders.id, extId));
  check("оплачен при оформлении → платёж и paid", created.status === "paid" && eRow.status === "paid");
  check("расчётная себестоимость в расходе", near(created.totalExpense, 300));

  const afterExpense = await db.transaction(async (tx) => {
    await tx.insert(orderExpenses).values({ orderAccountingId: created.cardId, amount: "100.00", description: "Доставка" });
    return svc.recalcCard(tx, created.cardId);
  });
  [eRow] = await db.select().from(externalOrders).where(eq(externalOrders.id, extId));
  check("расход не сбрасывает статус оплаты", afterExpense.status === "paid" && eRow.status === "paid");
  check("ручной расход прибавился", near(afterExpense.totalExpense, 400));

  const [m] = await db
    .insert(materials)
    .values({ name: "Проверка денег - материал", unit: "м", costPerUnit: "50.00", minStock: "0.00" })
    .returning({ id: materials.id });
  materialId = m.id;
  await db.insert(materialsStock).values({ materialId, quantity: "100.00" });
  const afterWriteOff = await db.transaction(async (tx) => {
    await applyMovement(tx, { materialId, type: "out", quantity: "2", referenceType: "order", referenceId: extId, comment: `Заказ менеджера № ${extId}` });
    return svc.recordWriteOffExpense(tx, ext, { materialName: "Проверка денег - материал", quantity: "2", unit: "м", costPerUnit: "50.00", cost: 100 });
  });
  check(
    "списание: расход = ручной + факт, оценка не удваивает",
    near(afterWriteOff.totalExpense, 200),
    `расход ${afterWriteOff.totalExpense}`,
  );
  check("оценка осталась для сравнения", near(afterWriteOff.estimatedExpense, 300));

  const adjusted = await db.transaction(async (tx) => {
    await tx.update(externalOrders).set({ adjustment: "-200.00" }).where(eq(externalOrders.id, extId));
    return svc.recalcOrderMoney(tx, ext, { rebuildTotal: true });
  });
  check("корректировка: итог = позиции + скидка", near(adjusted.income, 800));
  check("переплата после скидки - всё ещё оплачен", adjusted.status === "paid");

  const withItem = await db.transaction(async (tx) => {
    await tx.insert(externalOrderItems).values({ externalOrderId: extId, isCustom: true, itemName: "Ещё", quantity: 1, price: "700.00" });
    return svc.recalcOrderMoney(tx, ext, { rebuildTotal: true, refreshEstimate: true });
  });
  check("новая позиция пересчитала итог и статус", near(withItem.income, 1500) && withItem.status === "partial");

  // ---- удаление
  console.log("\nУдаление");
  let refusedDelete = "";
  try {
    await db.transaction((tx) => svc.deleteExternalOrderChecked(tx, extId));
  } catch (err) {
    refusedDelete = err instanceof svc.MoneyRuleError ? err.message : String(err);
  }
  check("заказ с платежом удалить нельзя", refusedDelete.includes("отмените заказ"), refusedDelete);

  const [e2] = await db
    .insert(externalOrders)
    .values({ clientName: "Проверка денег 2", totalPrice: "0.00" })
    .returning({ id: externalOrders.id });
  ext2Id = e2.id;
  await db.insert(externalOrderItems).values({ externalOrderId: ext2Id, isCustom: true, itemName: "Тест", quantity: 1, price: "100.00" });
  const s2 = await db.transaction((tx) => svc.recalcOrderMoney(tx, { source: "external", id: ext2Id }, { rebuildTotal: true, refreshEstimate: true }));
  await db.transaction((tx) => svc.deleteExternalOrderChecked(tx, ext2Id));
  const leftCard = await db.select().from(ordersAccounting).where(eq(ordersAccounting.id, s2.cardId));
  const leftOrder = await db.select().from(externalOrders).where(eq(externalOrders.id, ext2Id));
  check("пустой заказ удаляется вместе с карточкой", leftCard.length === 0 && leftOrder.length === 0);
  if (leftOrder.length === 0) ext2Id = null;

  // ---- отмена заказа менеджера
  const cancelledExt = await db.transaction(async (tx) => {
    await svc.changeOrderStatus(tx, ext, "cancelled");
    return svc.recalcOrderMoney(tx, ext);
  });
  check("отменённый заказ менеджера вне выручки", cancelledExt.isCancelled === true);

  let systemRefused = false;
  try {
    await db.transaction((tx) => svc.changeOrderStatus(tx, ext, "in_work", { system: true }));
  } catch (err) {
    systemRefused = err instanceof svc.MoneyRuleError;
  }
  check("производство не оживляет отменённый заказ", systemRefused);

  // Проверяем и откатываем: скидку больше позиций действие не записывает
  let clamped = null;
  await db
    .transaction(async (tx) => {
      await tx.update(externalOrders).set({ adjustment: "-99999.00" }).where(eq(externalOrders.id, extId));
      clamped = await svc.recalcOrderMoney(tx, ext, { rebuildTotal: true });
      tx.rollback();
    })
    .catch(() => {});
  check(
    "скидка больше позиций - пересчёт сообщает об обрезке",
    clamped?.totalClamped === true && clamped.income === 0,
  );
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  // Карточки заказов менеджера не уносятся каскадом (set null) - удаляем сами.
  // Платежи и расходы уходят вместе с карточкой
  const extIds = [extId, ext2Id].filter((v) => v !== null);
  if (extIds.length) {
    await db.delete(ordersAccounting).where(inArray(ordersAccounting.externalOrderId, extIds));
    await db.delete(externalOrders).where(inArray(externalOrders.id, extIds));
  }
  if (invoiceId) await db.delete(tochkaInvoices).where(eq(tochkaInvoices.id, invoiceId));
  // Карточка сайтового заказа держит заказ (restrict) - сначала она
  if (siteId) await db.delete(ordersAccounting).where(eq(ordersAccounting.orderId, siteId));
  if (siteId) await db.delete(orders).where(eq(orders.id, siteId));
  if (materialId) await db.delete(materials).where(eq(materials.id, materialId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
}

const leftovers = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, MARK));
check("тестовые строки удалены", leftovers.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
await db.$client.end();
// process.exit на Windows роняет воркер модульных хуков
process.exitCode = failed === 0 ? 0 : 1;
