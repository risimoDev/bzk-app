/**
 * Проверки заданий подрядчику и структуры заказа.
 *
 *   npm run check:contractor-task
 *
 * Главное правило: лист «Задание подрядчику» уходит на сторону, и в нём
 * нет ни данных клиента, ни денег. Проверяется тремя способами:
 *  - по исходнику листа и его загрузчика (нет обращений к полям клиента
 *    и к ценам, заказ читается ради одного id);
 *  - на настоящих данных: заказ с «секретным» клиентом и ценами, а в
 *    ответе загрузчика этих значений нет;
 *  - чистая логика: переходы статусов, номер задания, группировка,
 *    структура заказа (сумма по категориям + корректировка = итог).
 *
 * Скрипт заводит свои строки и убирает их за собой.
 */
import fs from "node:fs";
import path from "node:path";
import { databaseUrl } from "./db-url.mjs";

process.env.DATABASE_URL = databaseUrl();

const { eq, inArray } = await import("drizzle-orm");
const { db } = await import("@/db");
const { externalOrders, externalOrderItems, suppliers } = await import("@/db/schema");
const task = await import("@/lib/contractor-task");
const structure = await import("@/lib/order-structure");
const taskDb = await import("@/lib/contractor-task-db");

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

// ------------------------------------------------------ статусы подрядчика

console.log("Статус работы подрядчика");
const { canChangeContractorStatus: can, nextContractorStatuses, CONTRACTOR_STATUS_ORDER } = task;
check(
  "порядок: не отправлено → отправлено → принято → отгружено → получено",
  CONTRACTOR_STATUS_ORDER.join(">") === "not_sent>sent>accepted>shipped>received",
);
check("вперёд на следующий этап", can("not_sent", "sent") && can("sent", "accepted"));
check("вперёд через этап (сразу отгрузил)", can("sent", "shipped") && can("not_sent", "received"));
check("назад на шаг (исправить отметку)", can("received", "shipped") && can("sent", "not_sent"));
check("назад через этап нельзя", !can("received", "sent") && !can("shipped", "not_sent"));
check("тот же статус - не переход", !can("sent", "sent"));
check("неизвестный статус не принимается", !task.isContractorStatus("constructor") && !task.isContractorStatus("toString"));
check(
  "из «получено» только назад на шаг",
  nextContractorStatuses("received").join(",") === "shipped",
);
check("неизвестное значение читается как «не отправлено»", task.contractorStatusOf("zzz") === "not_sent");

console.log("\nНомер задания и группы");
check("номер задания П-<заказ>-<подрядчик>", task.contractorTaskNumber(81, 5) === "П-81-5");
{
  const items = [
    { id: 1, isOutsourced: true, supplierId: 3 },
    { id: 2, isOutsourced: false, supplierId: null },
    { id: 3, isOutsourced: true, supplierId: 4 },
    { id: 4, isOutsourced: true, supplierId: 3 },
    { id: 5, isOutsourced: true, supplierId: null },
  ];
  const g = task.groupBySupplier(items);
  check("группы по подрядчикам", g.size === 2 && g.get(3).length === 2 && g.get(4).length === 1);
  check("своя работа и перезаказ без подрядчика в группы не входят", ![...g.values()].flat().some((i) => i.id === 2 || i.id === 5));
}

// ------------------------------------------------------ структура заказа

console.log("\nСтруктура заказа");
const { sumByCategory, buildStructure, itemCategoryOf, ITEM_CATEGORY, ITEM_CATEGORY_ORDER, marginPct } = structure;
check(
  "категории: печать, конструкции и материалы, дизайн, монтаж, доставка и техника, прочее",
  ITEM_CATEGORY_ORDER.map((c) => ITEM_CATEGORY[c].label).join("|") ===
    "Печать|Конструкции и материалы|Дизайн|Монтаж|Доставка и техника|Прочее",
);
check("по умолчанию - печать", itemCategoryOf(undefined) === "print" && itemCategoryOf("constructor") === "print");

{
  const lines = sumByCategory([
    { category: "print", price: "1000.10", expense: "400.00" },
    { category: "print", price: "500.20", expense: "100.05" },
    { category: "installation", price: "2000.00", expense: "1500.00" },
    { category: null, price: "100.00", expense: "0.00" },
  ]);
  check("строки в порядке категорий, пустые не показываются", lines.map((l) => l.category).join(",") === "print,installation");
  check("копейки складываются точно", lines[0].revenue === 1600.3 && lines[0].expense === 500.05 && lines[0].count === 3);

  const s = buildStructure(lines, 3600.3);
  const revSum = Math.round(s.rows.reduce((t, r) => t + r.revenue * 100, 0));
  check("итог равен итогу заказа", s.total.revenue === 3600.3);
  check("без корректировки её строки нет", s.adjustment === 0);
  check("выручка категорий + корректировка = итог", revSum + Math.round(s.adjustment * 100) === Math.round(s.total.revenue * 100));
  check("маржа категории = выручка − расход", s.rows[0].margin === 1100.25 && s.rows[1].margin === 500);
  check("маржа % от выручки", s.rows[1].marginPct === 25);
  check("итоговый расход - сумма по категориям", s.total.expense === 2000.05);

  const sd = buildStructure(lines, 3300.3);
  check("скидка - отдельной строкой, категории не меняются", sd.adjustment === -300 && sd.rows[0].revenue === 1600.3 && sd.rows[1].revenue === 2000);
  check("маржа итога с учётом скидки", sd.total.margin === 1300.25, String(sd.total.margin));
  const sn = buildStructure(lines, 3800.3);
  check("наценка - положительная корректировка", sn.adjustment === 200);
}
check("нулевая выручка - процента нет", marginPct(0, -50) === null);
check("пустой заказ не ломает расчёт", buildStructure([], 0).total.margin === 0);

// ------------------------------------- исходник листа: ни клиента, ни денег

console.log("\nИсходник листа");
const SRC = path.resolve("src");
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const sources = {
  "app/print/contractor/[orderId]/[supplierId]/page.tsx": null,
  "lib/contractor-task-db.ts": null,
  "lib/contractor-task.ts": null,
};
for (const f of Object.keys(sources)) {
  sources[f] = stripComments(fs.readFileSync(path.join(SRC, f), "utf8"));
}

// Поля клиента и деньги: в коде листа и загрузчика их быть не должно
const MONEY = /price|total|expense|adjust|amount|cost|\bsum\b/i;
const CLIENT = /clientName|\bclients\b|clientId|customer|\.phone\b|\.email\b|\.address\b|contact_info|contactInfo/;
for (const [f, code] of Object.entries(sources)) {
  check(`${f}: нет цен и сумм`, !MONEY.test(code), MONEY.exec(code)?.[0] ?? "");
  check(`${f}: нет данных клиента`, !CLIENT.test(code), CLIENT.exec(code)?.[0] ?? "");
}

const loader = sources["lib/contractor-task-db.ts"];
const page = sources["app/print/contractor/[orderId]/[supplierId]/page.tsx"];
{
  // Из заказа читается только id: остальное - поля клиента и деньги
  const orderRefs = [...loader.matchAll(/externalOrders\.(\w+)/g)].map((m) => m[1]);
  check("из заказа читается только id", orderRefs.length > 0 && orderRefs.every((r) => r === "id"), orderRefs.join(","));

  const itemRefs = new Set([...loader.matchAll(/externalOrderItems\.(\w+)/g)].map((m) => m[1]));
  const allowedItem = new Set([
    "itemName", "itemDescription", "quantity", "contractorDueDate", "contractorStatus",
    "externalOrderId", "productId", "supplierId", "isOutsourced", "id", "contractorStatusAt",
  ]);
  check(
    "из позиций читаются только поля задания",
    [...itemRefs].every((r) => allowedItem.has(r)),
    [...itemRefs].filter((r) => !allowedItem.has(r)).join(","),
  );

  const supplierRefs = new Set([...loader.matchAll(/\bsuppliers\.(\w+)/g)].map((m) => m[1]));
  check(
    "от подрядчика - только имя и контактное лицо",
    [...supplierRefs].every((r) => ["name", "contactPerson", "id"].includes(r)),
    [...supplierRefs].join(","),
  );

  check("выборки поимённые (нет select() без колонок)", !/\.select\(\s*\)/.test(loader));
  check("лист не ходит в базу сам", !/from "@\/db/.test(page), "данные только через loadContractorTask");
  check("лист берёт данные из загрузчика", page.includes("loadContractorTask("));
  check("лист проверяет право на заказы", /can\("orders",\s*"view"\)/.test(page));
  check("веб-ссылки подрядчику нет: нет публичного маршрута", !fs.existsSync(path.join(SRC, "app/(site)/contractor")));
}

// ------------------------------------------------------- действия и формы

console.log("\nДействия");
const actions = fs.readFileSync(path.join(SRC, "app/actions/external-orders.ts"), "utf8");
for (const name of ["setContractorStatus", "markContractorTaskSent"]) {
  const body = actions.split(new RegExp(`export async function ${name}\\b`))[1]?.split(/\nexport async function /)[0] ?? "";
  check(`${name}: право orders.edit`, /can\("orders",\s*"edit"\)/.test(body));
  check(`${name}: пишет в журнал`, body.includes("audit("));
}
check("вид работ проверяется по словарю", /isKeyOf\(ITEM_CATEGORY,/.test(actions));
check("статус подрядчика проверяется по словарю", /isContractorStatus\(to\)/.test(actions));

// ------------------------------------------------- настоящие данные в базе

console.log("\nНа данных базы");
const SECRET_NAME = "СЕКРЕТНЫЙ-КЛИЕНТ-ZQ7";
const SECRET_PHONE = "+7 (999) 777-66-55";
const SECRET_MAIL = "secret-client-zq7@example.com";
const SECRET_ADDR = "ул. Секретная, 77";
const SECRET_NOTE = "КОММЕНТАРИЙ-КЛИЕНТА-ZQ7";
const SECRET_PRICE = "98765.43";

let orderId = null;
let supplierId = null;
let otherSupplierId = null;
try {
  const [sup] = await db
    .insert(suppliers)
    .values({ name: "Проверка подрядчика A", contactPerson: "Пётр Подрядчиков" })
    .returning({ id: suppliers.id });
  supplierId = sup.id;
  const [sup2] = await db.insert(suppliers).values({ name: "Проверка подрядчика B" }).returning({ id: suppliers.id });
  otherSupplierId = sup2.id;

  const [o] = await db
    .insert(externalOrders)
    .values({
      clientName: SECRET_NAME,
      phone: SECRET_PHONE,
      email: SECRET_MAIL,
      address: SECRET_ADDR,
      description: SECRET_NOTE,
      totalPrice: SECRET_PRICE,
      adjustmentNote: SECRET_NOTE,
    })
    .returning({ id: externalOrders.id });
  orderId = o.id;

  const base = { externalOrderId: orderId, isCustom: true, quantity: 3, price: SECRET_PRICE, expenseAmount: "55555.55" };
  const due = new Date(2030, 4, 20, 12, 0, 0);
  await db.insert(externalOrderItems).values([
    { ...base, itemName: "Баннер 3х1", itemDescription: "Люверсы по периметру", isOutsourced: true, supplierId, contractorDueDate: due, itemCategory: "print" },
    { ...base, itemName: "Монтаж", isOutsourced: true, supplierId, itemCategory: "installation" },
    { ...base, itemName: "Чужая работа", isOutsourced: true, supplierId: otherSupplierId },
    { ...base, itemName: "Своя печать", isOutsourced: false },
  ]);

  const t = await taskDb.loadContractorTask(orderId, supplierId);
  check("задание собрано", t !== null && t.number === `П-${orderId}-${supplierId}`);
  check("в задании только позиции этого подрядчика", t.items.length === 2 && t.items.every((i) => i.name !== "Чужая работа" && i.name !== "Своя печать"));
  check("количество, описание и срок на месте", t.items[0].quantity === 3 && t.items[0].description === "Люверсы по периметру" && t.items[0].dueDate?.getDate() === 20);
  check("есть неотправленные", t.hasUnsent === true);

  const dump = JSON.stringify(t);
  for (const [label, secret] of [
    ["имя клиента", SECRET_NAME],
    ["телефон клиента", SECRET_PHONE],
    ["почта клиента", SECRET_MAIL],
    ["адрес клиента", SECRET_ADDR],
    ["комментарий клиента", SECRET_NOTE],
    ["сумма позиции", "98765"],
    ["себестоимость", "55555"],
  ]) {
    check(`в задании нет: ${label}`, !dump.includes(secret));
  }
  check("у задания только положенные поля", Object.keys(t).sort().join() === "hasUnsent,items,number,supplier");
  check("у позиции только положенные поля", Object.keys(t.items[0]).sort().join() === "description,dueDate,name,quantity,unit");

  check("несуществующий заказ - нет задания", (await taskDb.loadContractorTask(2147483000, supplierId)) === null);
  check("подрядчик без позиций в заказе - нет задания", (await taskDb.loadContractorTask(orderId, 2147483000)) === null);

  // ---- смена статуса
  const rows = await db
    .select({ id: externalOrderItems.id, name: externalOrderItems.itemName })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.externalOrderId, orderId));
  const banner = rows.find((r) => r.name === "Баннер 3х1").id;
  const own = rows.find((r) => r.name === "Своя печать").id;

  const stateOf = async (id) =>
    (await db.select().from(externalOrderItems).where(eq(externalOrderItems.id, id)))[0];

  check("новая позиция - «не отправлено», времени нет", (await stateOf(banner)).contractorStatus === "not_sent" && (await stateOf(banner)).contractorStatusAt === null);

  const r1 = await db.transaction((tx) => taskDb.changeContractorStatus(tx, { orderId, itemId: banner, to: "sent" }));
  const afterSent = await stateOf(banner);
  check("не отправлено → отправлено", r1.changed && afterSent.contractorStatus === "sent" && afterSent.contractorStatusAt instanceof Date);

  const same = await db.transaction((tx) => taskDb.changeContractorStatus(tx, { orderId, itemId: banner, to: "sent" }));
  check("тот же статус - без изменений", same.changed === false);

  const refuse = async (fn) => {
    try {
      await db.transaction(fn);
      return "";
    } catch (e) {
      return e instanceof taskDb.ContractorTaskError ? e.message : `другая ошибка: ${e}`;
    }
  };
  const back2 = await refuse(async (tx) => {
    await taskDb.changeContractorStatus(tx, { orderId, itemId: banner, to: "received" });
    await taskDb.changeContractorStatus(tx, { orderId, itemId: banner, to: "sent" });
  });
  check("получено → отправлено (назад через этап) отказ", back2.includes("Так статус"), back2);
  check("отказ откатил и первый шаг транзакции", (await stateOf(banner)).contractorStatus === "sent");

  const notMine = await refuse((tx) => taskDb.changeContractorStatus(tx, { orderId: orderId + 1_000_000, itemId: banner, to: "accepted" }));
  check("позиция другого заказа не меняется", notMine === "Позиция не найдена", notMine);
  const ownTry = await refuse((tx) => taskDb.changeContractorStatus(tx, { orderId, itemId: own, to: "sent" }));
  check("своя работа без подрядчика статуса не получает", ownTry.includes("не перезаказана"), ownTry);

  // ---- «отправлено» для всей группы
  const ids = await db.transaction((tx) => taskDb.markTaskSent(tx, { orderId, supplierId }));
  check("группа: отмечены только ещё не отправленные", ids.length === 1);
  const t2 = await taskDb.loadContractorTask(orderId, supplierId);
  check("после отметки неотправленных нет", t2.hasUnsent === false);
  const idsAgain = await db.transaction((tx) => taskDb.markTaskSent(tx, { orderId, supplierId }));
  check("повторная отметка ничего не меняет", idsAgain.length === 0);
  const foreign = await db
    .select({ s: externalOrderItems.contractorStatus })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.supplierId, otherSupplierId));
  check("позиции другого подрядчика не задеты", foreign.every((f) => f.s === "not_sent"));
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  if (orderId) await db.delete(externalOrders).where(eq(externalOrders.id, orderId));
  const sups = [supplierId, otherSupplierId].filter((v) => v !== null);
  if (sups.length) await db.delete(suppliers).where(inArray(suppliers.id, sups));
}

const left = orderId
  ? await db.select({ id: externalOrders.id }).from(externalOrders).where(eq(externalOrders.id, orderId))
  : [];
check("тестовые строки удалены", left.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
await db.$client.end();
// process.exit на Windows роняет воркер модульных хуков
process.exitCode = failed === 0 ? 0 : 1;
