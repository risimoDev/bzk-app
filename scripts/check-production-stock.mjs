/**
 * Проверки цеха, склада и закупок (этап 2b аудита).
 *
 *   npm run check:production-stock
 *
 * Правила живут в src/lib/production.ts, purchases.ts (чистые) и
 * production-db.ts, purchases-db.ts, write-off-db.ts, quality-db.ts,
 * stock.ts (работа с базой). Здесь - чистые тесты и сценарии на настоящей
 * базе: этапы с одинаковым порядком, «Готов к выдаче», пауза и отмена,
 * средневзвешенная цена, оплата закупки, возврат списания, оповещения,
 * брак на проверке качества.
 *
 * Скрипт заводит свои строки и убирает их за собой.
 */
import { databaseUrl } from "./db-url.mjs";

// В контейнере .env нет - адрес приходит окружением; db-url.mjs знает оба случая
process.env.DATABASE_URL = databaseUrl();

const { and, eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/db");
const {
  users,
  orders,
  orderItems,
  externalOrders,
  externalOrderItems,
  ordersAccounting,
  orderExpenses,
  productionOrders,
  productionOrderStages,
  productionStages,
  materials,
  materialsStock,
  materialsMovements,
  purchaseOrders,
  purchaseOrderItems,
  suppliers,
  generalExpenses,
  expensesCategories,
  stockAlerts,
  qcInspections,
  tasks,
} = await import("@/db/schema");
const status = await import("@/lib/order-status");
const production = await import("@/lib/production");
const purchases = await import("@/lib/purchases");
const svc = await import("@/lib/order-money-db");
const prodDb = await import("@/lib/production-db");
const purchaseDb = await import("@/lib/purchases-db");
const writeOff = await import("@/lib/write-off-db");
const quality = await import("@/lib/quality-db");
const stock = await import("@/lib/stock");

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;
const refuses = async (fn, klass) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof klass ? e.message : `неожиданная ошибка: ${e?.message ?? e}`;
  }
};

// ------------------------------------------------------------ чистые правила

console.log("Чистые правила");
{
  const { nextStageIndex } = production;
  check(
    "первый «в работе» - текущий, следующий - первый ожидающий после него",
    JSON.stringify(nextStageIndex(["completed", "in_progress", "pending", "pending"])) ===
      JSON.stringify({ current: 1, next: 2 }),
  );
  check(
    "последний этап: следующего нет",
    JSON.stringify(nextStageIndex(["completed", "in_progress"])) === JSON.stringify({ current: 1, next: null }),
  );
  check(
    "нет «в работе» - берётся первый ожидающий",
    JSON.stringify(nextStageIndex(["completed", "pending", "pending"])) ===
      JSON.stringify({ current: 1, next: 2 }),
  );
  check("всё закрыто - закрывать нечего", nextStageIndex(["completed", "completed"]) === null);
  check(
    "пропущенный этап следующим не становится",
    JSON.stringify(nextStageIndex(["in_progress", "skipped", "pending"])) ===
      JSON.stringify({ current: 0, next: 2 }),
  );

  check("в_работе → готов к выдаче разрешён", status.canChangeStatus("in_work", "ready"));
  check("готов → отправлен/доставлен/завершён/отменён разрешены", ["shipped", "delivered", "completed", "cancelled"].every((t) => status.canChangeStatus("ready", t)));
  check("готов → новый запрещён", !status.canChangeStatus("ready", "pending"));
  check("у «Готов к выдаче» есть подпись", status.ORDER_STATUS.ready.label === "Готов к выдаче");
  check("и строка переходов", Array.isArray(status.ORDER_TRANSITIONS.ready));

  const w = purchases.weightedUnitCost;
  check("средневзвешенная: (10×100 + 10×200) / 20 = 150", w({ stock: 10, oldCost: 100, received: 10, price: 200 }) === 150);
  check("старой цены нет - цена закупки", w({ stock: 10, oldCost: null, received: 5, price: 80 }) === 80);
  check("остатка нет - цена закупки", w({ stock: 0, oldCost: 100, received: 5, price: 80 }) === 80);
  check("нулевая цена закупки цену не трогает", w({ stock: 10, oldCost: 100, received: 5, price: 0 }) === 100);
  check("округление до копеек", w({ stock: 3, oldCost: 10, received: 1, price: 11 }) === 10.25);
  check(
    "доставка делится пропорционально сумме позиции",
    near(purchases.landedUnitPrice({ unitPrice: 100, itemTotal: 1000, goodsTotal: 1000, shipping: 100, quantity: 10 }), 110) &&
      near(purchases.landedUnitPrice({ unitPrice: 100, itemTotal: 500, goodsTotal: 1000, shipping: 100, quantity: 5 }), 110),
  );
  check("без доставки цена та же", purchases.landedUnitPrice({ unitPrice: 100, itemTotal: 1000, goodsTotal: 1000, shipping: 0, quantity: 10 }) === 100);
  check("статус оплаты закупки: нет оплат / часть / всё", purchases.purchasePaymentState(1000, 0) === "unpaid" && purchases.purchasePaymentState(1000, 300) === "partial" && purchases.purchasePaymentState(1000, 1000) === "paid");
}

// ------------------------------------------------------------ сценарии в базе

const MARK = "production-stock-check@check.invalid";
const stamp = Date.now();
let userId = null;
const stageIds = [];
const extIds = [];
let siteId = null;
const materialIds = [];
const purchaseIds = [];
let supplierId = null;
let createdCategory = false;

const newExt = async (itemsCount = 1) => {
  const [e] = await db
    .insert(externalOrders)
    .values({ clientName: "Проверка цеха", totalPrice: "0.00" })
    .returning({ id: externalOrders.id });
  extIds.push(e.id);
  await db.insert(externalOrderItems).values({ externalOrderId: e.id, isCustom: true, itemName: "Тест", quantity: itemsCount, price: "100.00" });
  await db.transaction((tx) => svc.recalcOrderMoney(tx, { source: "external", id: e.id }, { rebuildTotal: true, refreshEstimate: true }));
  return { source: "external", id: e.id };
};
const extStatus = async (id) => (await db.select().from(externalOrders).where(eq(externalOrders.id, id)))[0].productionStatus;
const newMaterial = async (name, { cost = null, qty = "0", min = "0.00", active = true } = {}) => {
  const [m] = await db
    .insert(materials)
    .values({ name: `${name} ${stamp}`, unit: "м", costPerUnit: cost, minStock: min, isActive: active })
    .returning({ id: materials.id });
  materialIds.push(m.id);
  await db.insert(materialsStock).values({ materialId: m.id, quantity: qty });
  return m.id;
};
const matRow = async (id) => (await db.select().from(materials).where(eq(materials.id, id)))[0];
const stockOf = async (id) => Number((await db.select().from(materialsStock).where(eq(materialsStock.materialId, id)))[0].quantity);
const newPurchase = async (items, shipping = "0.00") => {
  const total = items.reduce((s, i) => s + i.qty * i.price, 0) + Number(shipping);
  const [p] = await db
    .insert(purchaseOrders)
    .values({
      orderNumber: `ПРОВ-${stamp}-${purchaseIds.length}`,
      supplierId,
      status: "sent",
      totalAmount: total.toFixed(2),
      shippingCost: shipping,
      createdBy: userId,
    })
    .returning({ id: purchaseOrders.id });
  purchaseIds.push(p.id);
  const rows = await db
    .insert(purchaseOrderItems)
    .values(items.map((i) => ({ purchaseOrderId: p.id, materialId: i.materialId, quantity: i.qty.toFixed(2), unitPrice: i.price.toFixed(2), totalPrice: (i.qty * i.price).toFixed(2) })))
    .returning({ id: purchaseOrderItems.id });
  return { id: p.id, itemIds: rows.map((r) => r.id) };
};
const receive = (itemId, quantity) => db.transaction((tx) => purchaseDb.receivePurchaseItem(tx, { itemId, quantity }));

try {
  const [u] = await db
    .insert(users)
    .values({ name: "Проверка цеха", email: MARK, password: "x", role: "manager" })
    .returning({ id: users.id });
  userId = u.id;

  // На пустой базе (CI) справочник этапов пуст, а запуск в цех требует хотя бы
  // два: заводим свои, с одинаковым порядком, и убираем в конце. В рабочей базе
  // этапы свои - их не трогаем
  const activeStages = await db.select({ id: productionStages.id }).from(productionStages).where(eq(productionStages.isActive, true));
  if (activeStages.length < 2) {
    const added = await db
      .insert(productionStages)
      .values([1, 2].map((n) => ({ name: `Проверка ${n}`, slug: `prov-${stamp}-${n}`, sortOrder: 0 })))
      .returning({ id: productionStages.id });
    stageIds.push(...added.map((r) => r.id));
  }

  // ---- этапы с одинаковым порядком проходятся все
  console.log("\nЦех: этапы");
  const e1 = await newExt();
  const started = await db.transaction((tx) => prodDb.startProductionOf(tx, e1, userId));
  check("запуск: заказ «В работе»", (await extStatus(e1.id)) === "in_work" && started.statusChanged === true);
  const stageRows = await db.select().from(productionOrderStages).where(eq(productionOrderStages.productionOrderId, started.productionOrderId));
  check("заказ разложен по этапам, первый в работе", stageRows.length >= 2 && stageRows.filter((r) => r.status === "in_progress").length === 1);

  // Как у этапов, заведённых раньше с порядком 0: все равны
  await db.update(productionOrderStages).set({ sortOrder: 0 }).where(eq(productionOrderStages.productionOrderId, started.productionOrderId));

  const total = stageRows.length;
  let closed = 0;
  let lastResult = null;
  const order = [];
  for (let i = 0; i < total + 1 && !lastResult?.finished; i++) {
    lastResult = await db.transaction((tx) => prodDb.advanceProduction(tx, started.productionOrderId, userId));
    closed++;
    order.push(lastResult.closedStageId);
  }
  const afterRows = await db.select().from(productionOrderStages).where(eq(productionOrderStages.productionOrderId, started.productionOrderId));
  check("нажатий ровно по числу этапов - ни один не пропущен", closed === total, `${closed} из ${total}`);
  check("все этапы закрыты", afterRows.every((r) => r.status === "completed"));
  const idOrder = [...stageRows].sort((a, b) => a.id - b.id).map((r) => r.stageId);
  check("порядок прохождения - по id при равном порядке", JSON.stringify(order) === JSON.stringify(idOrder));
  const [po1] = await db.select().from(productionOrders).where(eq(productionOrders.id, started.productionOrderId));
  check("производство завершено", po1.status === "completed" && po1.currentStageId === null);
  check("финал → заказ «Готов к выдаче»", (await extStatus(e1.id)) === "ready");
  const again = await refuses(() => db.transaction((tx) => prodDb.advanceProduction(tx, started.productionOrderId, userId)), svc.MoneyRuleError);
  check("завершённое производство не продвигается", again?.includes("завершено"), again ?? "");

  // ---- пауза и отмена
  console.log("\nЦех: пауза, отмена, ручной статус");
  const e2 = await newExt();
  const s2 = await db.transaction((tx) => prodDb.startProductionOf(tx, e2, userId));
  await db.transaction((tx) => prodDb.setProductionHold(tx, s2.productionOrderId, true));
  const heldBefore = await db.select().from(productionOrderStages).where(and(eq(productionOrderStages.productionOrderId, s2.productionOrderId), eq(productionOrderStages.status, "completed")));
  const onHold = await refuses(() => db.transaction((tx) => prodDb.advanceProduction(tx, s2.productionOrderId, userId)), svc.MoneyRuleError);
  const heldAfter = await db.select().from(productionOrderStages).where(and(eq(productionOrderStages.productionOrderId, s2.productionOrderId), eq(productionOrderStages.status, "completed")));
  check("на паузе этап не закрывается, причина понятна", onHold?.includes("приостановлено") && heldBefore.length === heldAfter.length, onHold ?? "");
  await db.transaction((tx) => prodDb.setProductionHold(tx, s2.productionOrderId, false));
  const resumed = await db.transaction((tx) => prodDb.advanceProduction(tx, s2.productionOrderId, userId));
  check("после снятия паузы этап закрывается", resumed.finished === false);

  const e3 = await newExt();
  const s3 = await db.transaction((tx) => prodDb.startProductionOf(tx, e3, userId));
  await db.transaction((tx) => svc.changeOrderStatus(tx, e3, "cancelled"));
  const cancelled = await refuses(() => db.transaction((tx) => prodDb.advanceProduction(tx, s3.productionOrderId, userId)), svc.MoneyRuleError);
  check("отменённый заказ не продвигается", cancelled?.includes("отменён"), cancelled ?? "");
  const cancelledHold = await refuses(() => db.transaction((tx) => prodDb.setProductionHold(tx, s3.productionOrderId, false)), svc.MoneyRuleError);
  check("и с паузы не снимается", cancelledHold?.includes("отменён"), cancelledHold ?? "");

  const e4 = await newExt();
  const s4 = await db.transaction((tx) => prodDb.startProductionOf(tx, e4, userId));
  await db.transaction((tx) => svc.changeOrderStatus(tx, e4, "shipped"));
  let r4 = null;
  for (let i = 0; i < 20 && !r4?.finished; i++) {
    r4 = await db.transaction((tx) => prodDb.advanceProduction(tx, s4.productionOrderId, userId));
  }
  check("вручную отправленный заказ финал производства не откатывает", (await extStatus(e4.id)) === "shipped");

  const dup = await refuses(() => db.transaction((tx) => prodDb.startProductionOf(tx, e2, userId)), svc.MoneyRuleError);
  check("повторный запуск заказа отклонён", dup?.includes("уже запущен"), dup ?? "");
  const e5 = await newExt();
  await db.update(externalOrders).set({ productionStatus: "shipped" }).where(eq(externalOrders.id, e5.id));
  const shippedStart = await refuses(() => db.transaction((tx) => prodDb.startProductionOf(tx, e5, userId)), svc.MoneyRuleError);
  check("отправленный заказ в цех не запускается", shippedStart?.includes("не запускают"), shippedStart ?? "");
  check("и его статус не откатился", (await extStatus(e5.id)) === "shipped");

  // Заказ с сайта: клиента надо уведомить - действие смотрит на siteStatusChanged
  const [so] = await db
    .insert(orders)
    .values({ userId, totalPrice: "0.00", shippingAddress: "-", contactInfo: JSON.stringify({ name: "Проверка цеха" }) })
    .returning({ id: orders.id });
  siteId = so.id;
  const site = { source: "site", id: siteId };
  await db.insert(orderItems).values({ orderId: siteId, itemName: "Тест", isCustom: true, quantity: 1, unitPrice: "100.00", price: "100.00" });
  await db.transaction((tx) => svc.recalcOrderMoney(tx, site, { rebuildTotal: true, refreshEstimate: true }));
  const sSite = await db.transaction((tx) => prodDb.startProductionOf(tx, site, userId));
  let rs = null;
  for (let i = 0; i < 20 && !rs?.finished; i++) {
    rs = await db.transaction((tx) => prodDb.advanceProduction(tx, sSite.productionOrderId, userId));
  }
  const [siteRow] = await db.select().from(orders).where(eq(orders.id, siteId));
  check("заказ с сайта: финал → «Готов к выдаче», клиента есть о чём уведомить", siteRow.status === "ready" && rs.siteStatusChanged === true);

  // ---- закупки: средневзвешенная цена
  console.log("\nЗакупки: цена и приёмка");
  const [sup] = await db.insert(suppliers).values({ name: `Проверка закупок ${stamp}` }).returning({ id: suppliers.id });
  supplierId = sup.id;

  const m1 = await newMaterial("Проверка ср.цены", { cost: "100.00", qty: "10.00" });
  const p1 = await newPurchase([{ materialId: m1, qty: 10, price: 200 }]);
  const rec1 = await receive(p1.itemIds[0], "10");
  const mat1 = await matRow(m1);
  check("средневзвешенная цена после приёмки", near(mat1.costPerUnit, 150), `цена ${mat1.costPerUnit}`);
  check("остаток вырос", (await stockOf(m1)) === 20);
  check("в отчёте приёмки старая и новая цена", rec1.oldCost === 100 && rec1.newCost === 150);
  const [mv1] = await db.select().from(materialsMovements).where(and(eq(materialsMovements.materialId, m1), eq(materialsMovements.type, "in")));
  check("движение - тип «закупка» со ссылкой на закупку", mv1.referenceType === "purchase" && mv1.referenceId === p1.id);
  const [pRow1] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, p1.id));
  check("закупка принята целиком", pRow1.status === "received");

  const m2 = await newMaterial("Проверка без цены", { cost: null, qty: "0.00" });
  const p2 = await newPurchase([{ materialId: m2, qty: 5, price: 80 }]);
  await receive(p2.itemIds[0], "2");
  check("старой цены нет - цена закупки", near((await matRow(m2)).costPerUnit, 80));
  const over = await refuses(() => receive(p2.itemIds[0], "4"), purchaseDb.PurchaseRuleError);
  check("больше заказанного принять нельзя", over?.includes("Больше заказанного"), over ?? "");
  await receive(p2.itemIds[0], "3");
  check("вторая часть по той же цене - цена не меняется", near((await matRow(m2)).costPerUnit, 80));

  const m3 = await newMaterial("Проверка доставки", { cost: null, qty: "0.00" });
  const p3 = await newPurchase([{ materialId: m3, qty: 10, price: 100 }], "100.00");
  await receive(p3.itemIds[0], "10");
  check("доставка закупки входит в цену единицы", near((await matRow(m3)).costPerUnit, 110), `цена ${(await matRow(m3)).costPerUnit}`);

  // ---- оплата закупки
  console.log("\nЗакупки: оплата");
  const catBefore = await db.select().from(expensesCategories).where(eq(expensesCategories.name, purchaseDb.PURCHASE_EXPENSE_CATEGORY));
  createdCategory = catBefore.length === 0;
  const pay1 = await db.transaction((tx) => purchaseDb.addPurchasePayment(tx, { purchaseOrderId: p1.id, amount: 500, paidAt: new Date() }));
  check("часть оплаты → «частично»", pay1.status === "partial" && near(pay1.paid, 500));
  const [exp1] = await db.select().from(generalExpenses).where(eq(generalExpenses.id, pay1.expenseId));
  const [cat] = await db.select().from(expensesCategories).where(eq(expensesCategories.id, exp1.categoryId));
  check("оплата записана общим расходом в категории «Закупка материалов»", exp1.purchaseOrderId === p1.id && cat.name === "Закупка материалов" && near(exp1.amount, 500));
  const pay2 = await db.transaction((tx) => purchaseDb.addPurchasePayment(tx, { purchaseOrderId: p1.id, amount: 1500, paidAt: new Date() }));
  const [pRow2] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, p1.id));
  check("остаток оплачен → «оплачена», сумма на закупке", pay2.status === "paid" && near(pRow2.paidAmount, 2000) && pRow2.paymentStatus === "paid");
  const overpay = await refuses(() => db.transaction((tx) => purchaseDb.addPurchasePayment(tx, { purchaseOrderId: p1.id, amount: 1, paidAt: new Date() })), purchaseDb.PurchaseRuleError);
  check("переплата отклонена", overpay?.includes("Больше суммы"), overpay ?? "");
  const delLinked = await refuses(() => db.transaction((tx) => purchaseDb.deleteGeneralExpenseRow(tx, pay1.expenseId)), purchaseDb.PurchaseRuleError);
  check("расход оплаты закупки отдельно не удаляется", delLinked?.includes("оплата закупки"), delLinked ?? "");
  const undone = await db.transaction((tx) => purchaseDb.removePurchasePayment(tx, pay2.expenseId));
  check("отмена оплаты возвращает «частично»", undone.status === "partial" && near(undone.paid, 500));

  // ---- списание и возврат
  console.log("\nСклад: списание и возврат");
  const wm = await newMaterial("Проверка списания", { cost: "50.00", qty: "100.00" });
  const wo = await newExt();
  const cardBefore = await db.transaction((tx) => svc.recalcOrderMoney(tx, wo));
  const done = await db.transaction((tx) => writeOff.writeOffToOrder(tx, wo, { materialId: wm, quantity: "4" }));
  check("списание: остаток уменьшился", (await stockOf(wm)) === 96);
  let card = (await db.select().from(ordersAccounting).where(eq(ordersAccounting.externalOrderId, wo.id)))[0];
  check("в расходе заказа - факт 200", near(card.totalExpense, 200));
  const [expRow] = await db.select().from(orderExpenses).where(eq(orderExpenses.materialMovementId, done.movementId));
  check("строка расхода помнит движение склада", expRow?.isWriteOff === true);

  const delWriteOff = await refuses(() => db.transaction((tx) => svc.deleteExpenseRow(tx, card.id, expRow.id)), svc.MoneyRuleError);
  check("удалить строку списания нельзя - только вернуть на склад", delWriteOff?.includes("верните материал"), delWriteOff ?? "");
  check("строка на месте, остаток прежний", (await db.select().from(orderExpenses).where(eq(orderExpenses.id, expRow.id))).length === 1 && (await stockOf(wm)) === 96);

  const foreign = await newExt();
  const wrongOrder = await refuses(() => db.transaction((tx) => writeOff.returnWriteOff(tx, foreign, done.movementId)), svc.MoneyRuleError);
  check("вернуть списание чужого заказа нельзя", wrongOrder?.includes("не найдено"), wrongOrder ?? "");

  const back = await db.transaction((tx) => writeOff.returnWriteOff(tx, wo, done.movementId));
  check("возврат: остаток восстановлен", (await stockOf(wm)) === 100);
  check("и строка расхода снята", back.expenseRemoved === true && (await db.select().from(orderExpenses).where(eq(orderExpenses.id, expRow.id))).length === 0);
  card = (await db.select().from(ordersAccounting).where(eq(ordersAccounting.externalOrderId, wo.id)))[0];
  check("расход заказа вернулся к оценке", near(card.totalExpense, cardBefore.totalExpense), `${card.totalExpense} / было ${cardBefore.totalExpense}`);
  const [reverse] = await db.select().from(materialsMovements).where(eq(materialsMovements.reversesMovementId, done.movementId));
  check("приход-возврат ссылается на списание", reverse?.type === "in" && reverse.referenceType === "order" && reverse.comment.includes("Возврат"));
  const twice = await refuses(() => db.transaction((tx) => writeOff.returnWriteOff(tx, wo, done.movementId)), svc.MoneyRuleError);
  check("повторный возврат отклонён", twice?.includes("уже возвращено"), twice ?? "");
  const listed = await writeOff.listWriteOffs(db, wo);
  check("в списке заказа списание помечено возвращённым", listed.length === 1 && listed[0].returned === true);

  // Списание на заказ с сайта: тип ссылки отличает его от заказа менеджера с тем же номером
  const siteWo = await db.transaction((tx) => writeOff.writeOffToOrder(tx, site, { materialId: wm, quantity: "1" }));
  const [siteMove] = await db.select().from(materialsMovements).where(eq(materialsMovements.id, siteWo.movementId));
  check("списание на заказ с сайта: тип «site_order» и подпись", siteMove.referenceType === "site_order" && siteMove.referenceId === siteId && siteMove.comment === `Заказ с сайта № ${siteId}`);
  const siteList = await writeOff.listWriteOffs(db, site);
  check("в списке сайтового заказа - только его списания", siteList.length === 1);
  const siteCard = (await db.select().from(ordersAccounting).where(eq(ordersAccounting.orderId, siteId)))[0];
  check("расход попал в карточку сайтового заказа", near(siteCard.totalExpense, 50));
  await db.transaction((tx) => writeOff.returnWriteOff(tx, site, siteWo.movementId));
  check("возврат с сайтового заказа восстановил остаток", (await stockOf(wm)) === 100);

  // отключённый материал и отменённый заказ
  const off = await newMaterial("Проверка выключенного", { cost: "10.00", qty: "10.00", active: false });
  const offTry = await refuses(() => db.transaction((tx) => writeOff.writeOffToOrder(tx, wo, { materialId: off, quantity: "1" })), svc.MoneyRuleError);
  check("отключённый материал на сервере не списывается", offTry?.includes("отключён"), offTry ?? "");
  const options = await writeOff.activeMaterialOptions(db);
  check("и в списках для форм его нет", !options.some((o) => o.id === off) && options.some((o) => o.id === wm));
  await db.transaction((tx) => svc.changeOrderStatus(tx, wo, "cancelled"));
  const cancelTry = await refuses(() => db.transaction((tx) => writeOff.writeOffToOrder(tx, wo, { materialId: wm, quantity: "1" })), svc.MoneyRuleError);
  check("на отменённый заказ не списывается", cancelTry?.includes("отменён"), cancelTry ?? "");

  // Старые списания (без связи со складом): пара определяется по времени
  // создания, а не по названию материала
  console.log("\nСклад: старые списания без связи");
  const lm = await newMaterial("Проверка старых списаний", { cost: "50.00", qty: "100.00" });
  const lo = await newExt();
  const first = await db.transaction((tx) => writeOff.writeOffToOrder(tx, lo, { materialId: lm, quantity: "2" }));
  await db.update(materials).set({ costPerUnit: null }).where(eq(materials.id, lm));
  const free = await db.transaction((tx) => writeOff.writeOffToOrder(tx, lo, { materialId: lm, quantity: "2" }));
  // Как до этапа 2b: связи нет; материал потом переименовали
  await db.update(orderExpenses).set({ materialMovementId: null }).where(eq(orderExpenses.materialMovementId, first.movementId));
  await db.update(materials).set({ name: `Переименован ${stamp}` }).where(eq(materials.id, lm));
  const backFree = await db.transaction((tx) => writeOff.returnWriteOff(tx, lo, free.movementId));
  const loCard = (await db.select().from(ordersAccounting).where(eq(ordersAccounting.externalOrderId, lo.id)))[0];
  const loRows = await db.select().from(orderExpenses).where(and(eq(orderExpenses.orderAccountingId, loCard.id), eq(orderExpenses.isWriteOff, true)));
  check("бесплатное списание не забирает чужой расход", backFree.expenseRemoved === false && loRows.length === 1);
  const backFirst = await db.transaction((tx) => writeOff.returnWriteOff(tx, lo, first.movementId));
  const loRows2 = await db.select().from(orderExpenses).where(and(eq(orderExpenses.orderAccountingId, loCard.id), eq(orderExpenses.isWriteOff, true)));
  check("расход находится по времени, хотя материал переименован", backFirst.expenseRemoved === true && loRows2.length === 0);

  // ---- возврат заказа в работу, гонки
  console.log("\nЦех: возврат в работу, гонки");
  await db.transaction((tx) => svc.changeOrderStatus(tx, e1, "in_work"));
  const [poRe] = await db.select().from(productionOrders).where(eq(productionOrders.id, started.productionOrderId));
  const reopened = await db.select().from(productionOrderStages).where(and(eq(productionOrderStages.productionOrderId, started.productionOrderId), eq(productionOrderStages.status, "in_progress")));
  check("ready → in_work переоткрывает последний этап", poRe.status === "in_progress" && reopened.length === 1 && poRe.currentStageId === reopened[0].stageId);
  const reDone = await db.transaction((tx) => prodDb.advanceProduction(tx, started.productionOrderId, userId));
  check("и его можно закрыть заново: снова «Готов к выдаче»", reDone.finished === true && (await extStatus(e1.id)) === "ready");

  const race = await newExt();
  const sr = await db.transaction((tx) => prodDb.startProductionOf(tx, race, userId));
  const raceStages = (await db.select().from(productionOrderStages).where(eq(productionOrderStages.productionOrderId, sr.productionOrderId))).length;
  for (let i = 0; i < raceStages - 1; i++) await db.transaction((tx) => prodDb.advanceProduction(tx, sr.productionOrderId, userId));
  const raced = await Promise.allSettled([
    db.transaction((tx) => prodDb.advanceProduction(tx, sr.productionOrderId, userId)),
    db.transaction((tx) => svc.changeOrderStatus(tx, race, "cancelled")),
  ]);
  const deadlock = raced.some((r) => r.status === "rejected" && /deadlock/i.test(String(r.reason?.message ?? r.reason) + String(r.reason?.cause?.message ?? "")));
  check("финал производства и отмена заказа разом: без взаимной блокировки", !deadlock, raced.map((r) => r.status).join("/"));

  // ---- две одновременные приёмки последних позиций
  const ra = await newMaterial("Проверка гонки A", { cost: null, qty: "0.00" });
  const rb = await newMaterial("Проверка гонки B", { cost: null, qty: "0.00" });
  const pr = await newPurchase([{ materialId: ra, qty: 3, price: 10 }, { materialId: rb, qty: 4, price: 10 }]);
  const parallel = await Promise.allSettled([receive(pr.itemIds[0], "3"), receive(pr.itemIds[1], "4")]);
  const [prRow] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, pr.id));
  check("две одновременные приёмки: закупка принята целиком", parallel.every((r) => r.status === "fulfilled") && prRow.status === "received", `${prRow.status}; ${parallel.map((r) => r.status).join("/")}`);

  // ---- оповещения о нехватке
  console.log("\nСклад: оповещения");
  const am = await newMaterial("Проверка оповещений", { cost: "1.00", qty: "20.00", min: "0.00" });
  const openAlerts = async () => (await db.select().from(stockAlerts).where(and(eq(stockAlerts.materialId, am), eq(stockAlerts.isResolved, false)))).length;
  const sync = () => db.transaction((tx) => stock.syncStockAlerts(tx, am));
  await sync();
  check("минимум 0 - оповещения нет", (await openAlerts()) === 0);
  await db.update(materials).set({ minStock: "50.00" }).where(eq(materials.id, am));
  await sync();
  check("поднятый минимум сразу даёт оповещение", (await openAlerts()) === 1);
  await sync();
  check("повторный пересчёт не плодит дубли", (await openAlerts()) === 1);
  await db.update(materials).set({ minStock: "10.00" }).where(eq(materials.id, am));
  await sync();
  check("сниженный минимум гасит оповещение", (await openAlerts()) === 0);
  await db.update(materials).set({ minStock: "50.00" }).where(eq(materials.id, am));
  await sync();
  await db.update(materials).set({ isActive: false }).where(eq(materials.id, am));
  await sync();
  check("выключенный материал оповещений не даёт", (await openAlerts()) === 0);

  // ---- контроль качества
  console.log("\nКонтроль качества: брак");
  const q = await newExt();
  const sq = await db.transaction((tx) => prodDb.startProductionOf(tx, q, userId));
  const noOrder = await refuses(() => quality.checkDefectRefs(db, 2147483000, null), quality.QualityRuleError);
  check("дефект несуществующего заказа отклонён", noOrder?.includes("не найден"), noOrder ?? "");
  const [insp] = await db
    .insert(qcInspections)
    .values({ productionOrderId: sq.productionOrderId, inspectorId: userId, result: "failed" })
    .returning({ id: qcInspections.id });
  const wrongInsp = await refuses(() => quality.checkDefectRefs(db, s2.productionOrderId, insp.id), quality.QualityRuleError);
  check("чужая проверка отклонена", wrongInsp?.includes("не относится"), wrongInsp ?? "");
  await quality.checkDefectRefs(db, sq.productionOrderId, insp.id);
  check("своя проверка принята", true);

  const handled = await db.transaction((tx) => quality.handleFailedInspection(tx, { productionOrderId: sq.productionOrderId, inspectionId: insp.id, inspectorId: userId }));
  const [poQ] = await db.select().from(productionOrders).where(eq(productionOrders.id, sq.productionOrderId));
  check("брак ставит производство на паузу", handled.paused === true && poQ.status === "on_hold");
  const [task] = await db.select().from(tasks).where(eq(tasks.id, handled.taskId));
  check("и заводит задачу сотруднику", task.title.startsWith("Разобрать брак по заказу") && task.assignedTo === userId && task.priority === "high");
  const second = await db.transaction((tx) => quality.handleFailedInspection(tx, { productionOrderId: sq.productionOrderId, inspectionId: insp.id, inspectorId: userId }));
  check("повторный брак на паузе: задача есть, паузу не трогаем", second.paused === false && second.taskId !== null);
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  try {
    if (purchaseIds.length) {
      await db.delete(generalExpenses).where(inArray(generalExpenses.purchaseOrderId, purchaseIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, purchaseIds));
    }
    if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId));
    if (createdCategory) await db.delete(expensesCategories).where(eq(expensesCategories.name, "Закупка материалов"));
    if (extIds.length) {
      // Карточки заказов менеджера не уносятся каскадом (set null)
      await db.delete(ordersAccounting).where(inArray(ordersAccounting.externalOrderId, extIds));
      await db.delete(externalOrders).where(inArray(externalOrders.id, extIds));
    }
    if (siteId) {
      await db.delete(ordersAccounting).where(eq(ordersAccounting.orderId, siteId));
      await db.delete(orders).where(eq(orders.id, siteId));
    }
    if (userId) await db.delete(tasks).where(eq(tasks.createdBy, userId));
    if (materialIds.length) await db.delete(materials).where(inArray(materials.id, materialIds));
    if (stageIds.length) await db.delete(productionStages).where(inArray(productionStages.id, stageIds));
    if (userId) await db.delete(users).where(eq(users.id, userId));
  } catch (err) {
    failed++;
    console.error("✗ уборка не удалась:", err);
  }
}

const leftovers = await db.select({ id: users.id }).from(users).where(eq(users.email, MARK));
check("тестовые строки удалены", leftovers.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
await db.$client.end();
// process.exit на Windows роняет воркер модульных хуков
process.exitCode = failed === 0 ? 0 : 1;
