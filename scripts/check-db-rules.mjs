/**
 * Проверки базы: счётчики номеров и правила удаления.
 *
 *   npm run check:db-rules
 *
 * Счётчики (lib/numbering-db.ts): параллельные запросы получают разные
 * номера, номера не пересекаются с уже существующими, подчёркивание и
 * процент в префиксе не работают как подстановка. Правила удаления:
 * историю заказов стереть нельзя - ни вместе с клиентом, ни вместе с
 * товаром.
 *
 * Скрипт заводит свои строки с пометкой и убирает их за собой.
 */
import { databaseUrl } from "./db-url.mjs";

process.env.DATABASE_URL = databaseUrl();

const { eq, inArray, like, sql } = await import("drizzle-orm");
const { db } = await import("@/db");
const {
  counters,
  documents,
  externalOrderItems,
  externalOrders,
  orderExpenses,
  orderItems,
  orders,
  ordersAccounting,
  products,
  users,
} = await import("@/db/schema");
const numbering = await import("@/lib/numbering-db");
const { isUniqueViolation } = await import("@/lib/db-errors");

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

const MARK = "proverka-db-rules@example.invalid";
const KEY = `test:check-db-rules:${Date.now()}`;
const YEAR = 9999;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let userId = null;
let productId = null;
let extOrderId = null;
let siteOrderId = null;
const docNumbers = [];

/** Операция с ожидаемым отказом базы: возвращает код ошибки Postgres или null. */
async function failsWith(run) {
  try {
    await run();
    return null;
  } catch (err) {
    let cur = err;
    for (let i = 0; i < 4 && cur; i++) {
      if (typeof cur.code === "string") return cur.code;
      cur = cur.cause;
    }
    return "unknown";
  }
}

async function cleanup() {
  await db.delete(counters).where(like(counters.key, "test:check-db-rules:%"));
  await db.delete(counters).where(inArray(counters.key, [
    `purchase:${YEAR}`,
    `offer:${YEAR}`,
    `ticket:${YEAR}1231`,
    `doc:CHKDB-${YEAR}`,
    `doc:CH_K%-${YEAR}`,
  ]));
  if (docNumbers.length) await db.delete(documents).where(inArray(documents.documentNumber, docNumbers));
  if (siteOrderId) {
    await db.delete(ordersAccounting).where(eq(ordersAccounting.orderId, siteOrderId));
    await db.delete(orders).where(eq(orders.id, siteOrderId));
  }
  if (extOrderId) await db.delete(externalOrders).where(eq(externalOrders.id, extOrderId));
  if (productId) await db.delete(products).where(eq(products.id, productId));
  await db.delete(users).where(eq(users.email, MARK));
}

try {
  await cleanup();

  // ------------------------------------------------------------ счётчики
  console.log("Счётчики номеров");

  // 20 транзакций стартуют вместе и держат номер до конца: без атомарного
  // счётчика они выдали бы одинаковые
  const got = await Promise.all(
    Array.from({ length: 20 }, () =>
      db.transaction(async (tx) => {
        const n = await numbering.nextNumber(tx, KEY);
        await pause(15);
        return n;
      }),
    ),
  );
  check("20 параллельных запросов - 20 разных номеров", new Set(got).size === 20, got.join(","));
  check("номера идут подряд с единицы", Math.min(...got) === 1 && Math.max(...got) === 20);

  const floored = await db.transaction((tx) => numbering.nextNumber(tx, KEY, 100));
  check("пол: счётчик догоняет существующий максимум", floored === 101, String(floored));
  const after = await db.transaction((tx) => numbering.nextNumber(tx, KEY, 5));
  check("пол ниже счётчика его не откатывает", after === 102, String(after));

  // Откат транзакции возвращает и номер: дыр в нумерации нет
  const keep = await db.transaction((tx) => numbering.nextNumber(tx, KEY));
  await db
    .transaction(async (tx) => {
      await numbering.nextNumber(tx, KEY);
      tx.rollback();
    })
    .catch(() => {});
  const next = await db.transaction((tx) => numbering.nextNumber(tx, KEY));
  check("откат транзакции не расходует номер", next === keep + 1, `${keep} -> ${next}`);

  const purchases = await Promise.all(
    Array.from({ length: 8 }, () => db.transaction((tx) => numbering.nextPurchaseNumber(tx, YEAR))),
  );
  check("закупки: форматы и уникальность", new Set(purchases).size === 8 && purchases.includes(`ЗК-${YEAR}-001`), purchases.sort().join(" "));

  const offer = await db.transaction((tx) => numbering.nextOfferNumber(tx, YEAR));
  check("КП: формат", offer === `КП-${YEAR}-0001`, offer);

  const ticket = await db.transaction((tx) => numbering.nextTicketNumber(tx, `${YEAR}1231`));
  check("обращение: формат", ticket === `TK-${YEAR}1231-0001`, ticket);

  // Номер, вписанный руками, учитывается: счётчик не выдаст его снова
  const manual = `CHKDB-${YEAR}-0007`;
  docNumbers.push(manual);
  await db.insert(documents).values({ title: "проверка нумерации", documentNumber: manual });
  const docNext = await db.transaction((tx) => numbering.nextDocumentNumber(tx, "CHKDB-", YEAR));
  check("документ: следующий за вписанным руками", docNext === `CHKDB-${YEAR}-0008`, docNext);

  // Подчёркивание и процент в префиксе - не подстановка (раньше был LIKE)
  const trap = `CH_K%-${YEAR}-0003`;
  const stranger = `CHXKY-${YEAR}-0900`;
  docNumbers.push(trap, stranger);
  await db.insert(documents).values([
    { title: "проверка нумерации 2", documentNumber: trap },
    { title: "проверка нумерации 3", documentNumber: stranger },
  ]);
  const trapNext = await db.transaction((tx) => numbering.nextDocumentNumber(tx, "CH_K%-", YEAR));
  check("префикс со спецсимволами не цепляет чужие номера", trapNext === `CH_K%-${YEAR}-0004`, trapNext);

  // ------------------------------------------------------------ уникальность
  console.log("\nУникальность");
  const dupCode = await failsWith(() =>
    db.insert(documents).values({ title: "дубль номера", documentNumber: manual }),
  );
  check("два документа с одним номером - отказ базы (23505)", dupCode === "23505", String(dupCode));
  try {
    await db.insert(documents).values({ title: "дубль номера", documentNumber: manual });
  } catch (err) {
    check("isUniqueViolation узнаёт ошибку по индексу", isUniqueViolation(err, "documents_document_number_unique"));
    check("isUniqueViolation не путает чужой индекс", !isUniqueViolation(err, "orders_checkout_token_unique"));
  }
  const noNumber = await failsWith(async () => {
    const [a, b] = await db
      .insert(documents)
      .values([{ title: "без номера 1" }, { title: "без номера 2" }])
      .returning({ id: documents.id });
    await db.delete(documents).where(inArray(documents.id, [a.id, b.id]));
  });
  check("документов без номера может быть сколько угодно", noNumber === null, String(noNumber));

  // ------------------------------------------------------------ правила удаления
  console.log("\nПравила удаления");

  const rules = await db.execute(sql`
    select conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as rule
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
  `);
  const ruleOf = (tbl, col) => rules.rows.find((r) => r.tbl === tbl && r.col === col)?.rule;
  // r = restrict, n = set null, a = no action, c = cascade
  const expected = [
    ["order_items", "product_id", "n"],
    ["external_order_items", "product_id", "n"],
    ["order_expenses", "order_item_id", "n"],
    ["orders", "user_id", "r"],
    ["orders_accounting", "order_id", "r"],
    ["tasks", "created_by", "r"],
    ["qc_inspections", "inspector_id", "r"],
    ["qc_defects", "reported_by", "r"],
    ["mass_messages", "created_by", "r"],
    ["chat_messages", "user_id", "a"],
    ["support_ticket_messages", "user_id", "a"],
    ["task_comments", "user_id", "a"],
    ["commercial_offers", "external_order_id", "n"],
  ];
  for (const [tbl, col, rule] of expected) {
    check(`${tbl}.${col}`, ruleOf(tbl, col) === rule, `${ruleOf(tbl, col)} вместо ${rule}`);
  }

  // Поведение, а не только каталог: заказ клиента держит клиента
  const [u] = await db
    .insert(users)
    .values({ name: "Проверка правил", email: MARK, password: "x", role: "user" })
    .returning({ id: users.id });
  userId = u.id;
  const [p] = await db
    .insert(products)
    .values({ name: "Проверочный товар", basePrice: "100.00" })
    .returning({ id: products.id });
  productId = p.id;

  const [o] = await db
    .insert(orders)
    .values({ userId, totalPrice: "100.00", shippingAddress: "-", contactInfo: "{}" })
    .returning({ id: orders.id });
  siteOrderId = o.id;
  const [item] = await db
    .insert(orderItems)
    .values({ orderId: siteOrderId, productId, itemName: "Проверочный товар, Бумага: белая", quantity: 1, price: "100.00" })
    .returning({ id: orderItems.id });
  const [card] = await db
    .insert(ordersAccounting)
    .values({ orderId: siteOrderId, income: "100.00" })
    .returning({ id: ordersAccounting.id });
  await db.insert(orderExpenses).values({ orderAccountingId: card.id, orderItemId: item.id, amount: "10.00" });

  const [eo] = await db
    .insert(externalOrders)
    .values({ clientName: "Проверка правил" })
    .returning({ id: externalOrders.id });
  extOrderId = eo.id;
  await db
    .insert(externalOrderItems)
    .values({ externalOrderId: extOrderId, productId, itemName: "Проверочный товар", price: "50.00" });

  // Ключ оформления: повтор с тем же ключом не создаёт второй заказ
  const token = "00000000-0000-4000-8000-00000000c0de";
  const tokenRow = { userId, totalPrice: "1.00", shippingAddress: "-", contactInfo: "{}", checkoutToken: token };
  const tokenIds = [];
  const [t1] = await db.insert(orders).values(tokenRow).returning({ id: orders.id });
  tokenIds.push(t1.id);
  let tokenErr = null;
  try {
    const [t2] = await db.insert(orders).values(tokenRow).returning({ id: orders.id });
    tokenIds.push(t2.id);
  } catch (err) {
    tokenErr = err;
  }
  check(
    "второй заказ с тем же ключом оформления - отказ по индексу",
    tokenErr !== null && isUniqueViolation(tokenErr, "orders_checkout_token_unique"),
  );
  const [n1] = await db.insert(orders).values({ ...tokenRow, checkoutToken: null }).returning({ id: orders.id });
  const [n2] = await db.insert(orders).values({ ...tokenRow, checkoutToken: null }).returning({ id: orders.id });
  tokenIds.push(n1.id, n2.id);
  check("заказов без ключа может быть сколько угодно", true);
  await db.delete(orders).where(inArray(orders.id, tokenIds));

  const delUser = await failsWith(() => db.delete(users).where(eq(users.id, userId)));
  check("клиента с заказами удалить нельзя (23503)", delUser === "23503", String(delUser));

  const delOrder = await failsWith(() => db.delete(orders).where(eq(orders.id, siteOrderId)));
  check("заказ с бухгалтерской карточкой удалить нельзя (23503)", delOrder === "23503", String(delOrder));

  await db.delete(products).where(eq(products.id, productId));
  productId = null;
  const [kept] = await db.select().from(orderItems).where(eq(orderItems.id, item.id));
  check("удалили товар - позиция заказа осталась", Boolean(kept));
  check("... без ссылки на товар", kept?.productId === null);
  check("... с названием на момент заказа", kept?.itemName === "Проверочный товар, Бумага: белая");
  const [keptExt] = await db.select().from(externalOrderItems).where(eq(externalOrderItems.externalOrderId, extOrderId));
  check("позиция заказа менеджера тоже осталась", Boolean(keptExt) && keptExt.productId === null);

  await db.delete(orderItems).where(eq(orderItems.id, item.id));
  const [expense] = await db.select().from(orderExpenses).where(eq(orderExpenses.orderAccountingId, card.id));
  check("удалили позицию - расход заказа остался", Boolean(expense) && expense.orderItemId === null);
} catch (err) {
  failed++;
  console.error("✗ сценарий упал:", err);
} finally {
  await cleanup();
}

const leftovers = await db.select({ id: users.id }).from(users).where(eq(users.email, MARK));
const leftCounters = await db.select({ key: counters.key }).from(counters).where(like(counters.key, "test:check-db-rules:%"));
check("тестовые строки удалены", leftovers.length === 0 && leftCounters.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
await db.$client.end();
