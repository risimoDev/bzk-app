/**
 * Проверки арифметики оформления заказа.
 *
 *   npm run check:checkout
 *
 * Считаем то, из чего складывается итог: надбавку за срочность и скидку
 * по промокоду. Ошибка здесь стоит денег в обе стороны, а увидеть её на
 * глаз в готовом заказе почти нельзя.
 *
 * Вторая часть работает с настоящей базой: лимит промокода при
 * одновременных заказах и одноразовый код у одного клиента. Скрипт
 * заводит свой код, пользователя и заказы и удаляет их за собой
 * (номера заказов из последовательности при этом расходуются).
 */
import fs from "node:fs";
import { discountFor, urgentFee, URGENT_RATE } from "@/lib/promocodes";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

// ---- срочность
check("надбавка - половина суммы", urgentFee(1000, true) === 500);
check("без срочности надбавки нет", urgentFee(1000, false) === 0);
check("ставка срочности 50%", URGENT_RATE === 0.5);
check("копейки округляются", urgentFee(333.33, true) === 166.67, String(urgentFee(333.33, true)));

// ---- процентная скидка
const percent = {
  code: "TEST10",
  discountType: "percentage",
  discountValue: "10",
  minOrderAmount: null,
  maxDiscountAmount: null,
};
check("процент считается от суммы", discountFor(percent, 1000) === 100);
check("процент округляется до копеек", discountFor(percent, 333.33) === 33.33, String(discountFor(percent, 333.33)));

// ---- потолок скидки
const capped = { ...percent, discountValue: "50", maxDiscountAmount: "300" };
check("потолок ограничивает скидку", discountFor(capped, 1000) === 300);
check("под потолком скидка полная", discountFor(capped, 400) === 200);

// ---- фиксированная скидка
const fixed = { ...percent, discountType: "fixed", discountValue: "250" };
check("фиксированная скидка", discountFor(fixed, 1000) === 250);
check(
  "скидка не больше суммы заказа",
  discountFor(fixed, 100) === 100,
  String(discountFor(fixed, 100)),
);

// ---- мусор
check("нулевая скидка ничего не даёт", discountFor({ ...percent, discountValue: "0" }, 1000) === 0);
check(
  "отрицательная скидка отброшена",
  discountFor({ ...percent, discountValue: "-10" }, 1000) === 0,
);
check(
  "нечисловая скидка отброшена",
  discountFor({ ...percent, discountValue: "abc" }, 1000) === 0,
);

// ---- порядок действий: срочность считается до скидки
const sum = 1000;
const withUrgent = sum + urgentFee(sum, true);
check(
  "скидка считается от суммы со срочностью",
  withUrgent - discountFor(percent, withUrgent) === 1350,
  String(withUrgent - discountFor(percent, withUrgent)),
);

// ---- промокоды в базе: лимит и одноразовость

const { db } = await import("../src/db/index.ts");
const { users, orders, orderPromocodes, promocodes } = await import("../src/db/schema.ts");
const { eq, inArray, sql } = await import("drizzle-orm");
const {
  checkPromocode,
  consumePromocode,
  PromoUnavailableError,
  PROMO_EXHAUSTED_MESSAGE,
  PROMO_ALREADY_USED_BY_YOU_MESSAGE,
} = await import("../src/lib/promocodes-db.ts");

const EMAIL = "proverka-promo@example.invalid";
const LIMITED = "CHECKLIMIT-TEST";
const SINGLE = "CHECKSINGLE-TEST";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Убирает следы - и перед проверкой (прошлый запуск мог упасть), и после. */
async function cleanup() {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (u) {
    // Заказы удаляем явно, не надеясь на каскад от пользователя
    await db.delete(orders).where(eq(orders.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  await db.delete(promocodes).where(inArray(promocodes.code, [LIMITED, SINGLE]));
}

/**
 * Заказ с кодом так же, как его пишет placeOrder: заказ, строка кода,
 * списание - одной транзакцией. `hold` держит транзакцию открытой, чтобы
 * два вызова гарантированно пересеклись.
 */
async function orderWithPromo(userId, code, hold = 0) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        totalPrice: "100.00",
        status: "pending",
        shippingAddress: "проверка",
        contactInfo: "{}",
      })
      .returning({ id: orders.id });
    await tx.insert(orderPromocodes).values({
      orderId: order.id,
      promoCode: code,
      discountType: "fixed",
      discountValue: "10.00",
      appliedDiscount: "10.00",
    });
    await consumePromocode(tx, code, { userId, orderId: order.id });
    if (hold) await pause(hold);
    return order.id;
  });
}

const usedCount = async (code) =>
  (await db.select({ n: promocodes.usedCount }).from(promocodes).where(eq(promocodes.code, code)))[0]
    ?.n;

const ordersOf = async (userId) =>
  Number(
    (await db.select({ n: sql`count(*)` }).from(orders).where(eq(orders.userId, userId)))[0].n,
  );

await cleanup();
try {
  const [user] = await db
    .insert(users)
    .values({ name: "Проверка промокода", email: EMAIL, password: "не-важно", role: "user" })
    .returning({ id: users.id });

  await db.insert(promocodes).values([
    { code: LIMITED, discountType: "fixed", discountValue: "10.00", usageLimit: 1, usedCount: 0 },
    { code: SINGLE, discountType: "fixed", discountValue: "10.00", isSingleUse: true },
  ]);

  // Лимит в одно использование и два заказа одновременно: раньше оба
  // проходили проверку, и счётчик становился 2 из 1
  const race = await Promise.allSettled([
    orderWithPromo(user.id, LIMITED, 300),
    orderWithPromo(user.id, LIMITED, 300),
  ]);
  const won = race.filter((r) => r.status === "fulfilled").length;
  const lost = race.filter(
    (r) => r.status === "rejected" && r.reason instanceof PromoUnavailableError,
  );
  check("лимит: из двух одновременных заказов прошёл один", won === 1, `прошло ${won}`);
  check(
    "лимит: второй получил понятный отказ",
    lost.length === 1 && lost[0].reason.message === PROMO_EXHAUSTED_MESSAGE,
  );
  const used = await usedCount(LIMITED);
  check("лимит: счётчик не превысил предел", used === 1, `used_count ${used}`);
  check("лимит: отказ откатил заказ целиком", (await ordersOf(user.id)) === 1);

  const exhausted = await checkPromocode(LIMITED, 1000);
  check("лимит: выбранный код больше не принимается", !exhausted.ok);

  // Одноразовый код: первый заказ проходит, повтор - нет
  const fresh = await checkPromocode(SINGLE, 1000, { userId: user.id });
  check("одноразовый: до первого заказа принимается", fresh.ok);

  const firstOrder = await orderWithPromo(user.id, SINGLE);
  const again = await checkPromocode(SINGLE, 1000, { userId: user.id });
  check(
    "одноразовый: повторно тому же клиенту отказ",
    !again.ok && again.message === PROMO_ALREADY_USED_BY_YOU_MESSAGE,
  );
  check(
    "одноразовый: другому клиенту не запрещён",
    (await checkPromocode(SINGLE, 1000, { userId: user.id + 1_000_000 })).ok,
  );

  let blocked = null;
  try {
    await orderWithPromo(user.id, SINGLE);
  } catch (e) {
    blocked = e;
  }
  check(
    "одноразовый: повтор отбит и внутри транзакции заказа",
    blocked instanceof PromoUnavailableError &&
      blocked.message === PROMO_ALREADY_USED_BY_YOU_MESSAGE,
  );
  check("одноразовый: отбитый заказ не записан", (await ordersOf(user.id)) === 2);

  // Статус в схеме допускает NULL; `<> 'cancelled'` такой заказ потерял бы
  await db.update(orders).set({ status: null }).where(eq(orders.id, firstOrder));
  const withNullStatus = await checkPromocode(SINGLE, 1000, { userId: user.id });
  check("одноразовый: заказ без статуса тоже считается", !withNullStatus.ok);

  // Отменённый заказ кода не расходует, и после него - снова гонка двух
  // одновременных заказов одного клиента
  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, firstOrder));
  check(
    "одноразовый: отменённый заказ не считается",
    (await checkPromocode(SINGLE, 1000, { userId: user.id })).ok,
  );
  const race2 = await Promise.allSettled([
    orderWithPromo(user.id, SINGLE, 300),
    orderWithPromo(user.id, SINGLE, 300),
  ]);
  check(
    "одноразовый: из двух одновременных заказов прошёл один",
    race2.filter((r) => r.status === "fulfilled").length === 1 &&
      race2.some((r) => r.status === "rejected" && r.reason instanceof PromoUnavailableError),
  );
} finally {
  await cleanup();
}

const leftUsers = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
const leftCodes = await db
  .select({ id: promocodes.id })
  .from(promocodes)
  .where(inArray(promocodes.code, [LIMITED, SINGLE]));
check("тестовые данные убраны", leftUsers.length === 0 && leftCodes.length === 0);

// Без этого процесс ждёт, пока пул сам закроет простаивающие соединения
await db.$client.end();

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
