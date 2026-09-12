/**
 * Проверки доступа клиента к счёту и УПД.
 *
 *   npm run check:documents
 *
 * Правило одно: клиент видит документы по своему заказу и только после
 * того, как менеджер их открыл. До согласования состава и суммы счёт -
 * черновик, и платить по нему нельзя. Ошибиться тут дороже всего:
 * клиент либо заплатит не ту сумму, либо увидит чужой заказ.
 *
 * Скрипт заводит свои строки и убирает их за собой.
 */
import fs from "node:fs";

// Под голым node .env никто не читает: разбираем сами. Сначала отрезаем
// комментарий, потом кавычки - иначе в значении остаётся хвостовая
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const { clients, externalOrders, orders, users } = await import("@/db/schema");
const { documentsVisibleToClient } = await import("@/lib/order-documents");

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

const MARK = "docs-access@check.invalid";
const MARK_OTHER = "docs-access-other@check.invalid";

let ownerId = null;
let strangerId = null;
let orderId = null;
let externalId = null;
let clientId = null;

try {
  const [owner] = await db
    .insert(users)
    .values({ name: "Проверка доступа", email: MARK, password: "x", role: "user" })
    .returning({ id: users.id });
  ownerId = owner.id;

  const [stranger] = await db
    .insert(users)
    .values({ name: "Чужой", email: MARK_OTHER, password: "x", role: "user" })
    .returning({ id: users.id });
  strangerId = stranger.id;

  const [order] = await db
    .insert(orders)
    .values({
      userId: ownerId,
      totalPrice: "100.00",
      shippingAddress: "-",
      contactInfo: "{}",
    })
    .returning({ id: orders.id });
  orderId = order.id;

  const [counterparty] = await db
    .insert(clients)
    .values({ name: "Проверка доступа", userId: ownerId })
    .returning({ id: clients.id });
  clientId = counterparty.id;

  const [external] = await db
    .insert(externalOrders)
    .values({ clientId, clientName: "Проверка доступа", totalPrice: "100.00" })
    .returning({ id: externalOrders.id });
  externalId = external.id;

  // ---- заказ с сайта
  check(
    "новый заказ: документы закрыты",
    (await documentsVisibleToClient("site", orderId, ownerId)) === false,
  );

  await db
    .update(orders)
    .set({ documentsVisible: true })
    .where(eq(orders.id, orderId));

  check(
    "менеджер открыл - клиент видит",
    (await documentsVisibleToClient("site", orderId, ownerId)) === true,
  );
  check(
    "чужому не видно даже открытые",
    (await documentsVisibleToClient("site", orderId, strangerId)) === false,
  );

  await db
    .update(orders)
    .set({ documentsVisible: false })
    .where(eq(orders.id, orderId));

  check(
    "менеджер закрыл обратно - не видно",
    (await documentsVisibleToClient("site", orderId, ownerId)) === false,
  );

  // ---- заказ менеджера: доходит до клиента через контрагента
  check(
    "заказ менеджера: документы закрыты",
    (await documentsVisibleToClient("external", externalId, ownerId)) === false,
  );

  await db
    .update(externalOrders)
    .set({ documentsVisible: true })
    .where(eq(externalOrders.id, externalId));

  check(
    "открытый заказ менеджера виден владельцу контрагента",
    (await documentsVisibleToClient("external", externalId, ownerId)) === true,
  );
  check(
    "чужому заказ менеджера не виден",
    (await documentsVisibleToClient("external", externalId, strangerId)) === false,
  );

  // Отвязка контрагента от аккаунта закрывает и его заказы
  await db.update(clients).set({ userId: null }).where(eq(clients.id, clientId));
  check(
    "без привязки контрагента доступа нет",
    (await documentsVisibleToClient("external", externalId, ownerId)) === false,
  );

  // ---- несуществующие номера
  check(
    "несуществующий заказ не открывается",
    (await documentsVisibleToClient("site", 999999, ownerId)) === false,
  );
} finally {
  if (externalId) await db.delete(externalOrders).where(eq(externalOrders.id, externalId));
  if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
  if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
  if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
  if (strangerId) await db.delete(users).where(eq(users.id, strangerId));
}

const [{ left }] = await db
  .select({ left: users.id })
  .from(users)
  .where(eq(users.email, MARK))
  .limit(1)
  .then((rows) => (rows.length ? rows : [{ left: null }]));

check("тестовые строки удалены", left === null);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
// process.exit на Windows роняет воркер модульных хуков
process.exitCode = failed === 0 ? 0 : 1;
