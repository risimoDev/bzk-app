import "server-only";
import { and, asc, count, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  externalOrderItems,
  externalOrders,
  materialsMovements,
  orderExpenses,
  orderItems,
  orderPayments,
  orders,
  ordersAccounting,
  productionOrders,
  tochkaInvoices,
} from "@/db/schema";
import { estimatedExpense, estimatedExpenseForOrder, taxRate } from "@/lib/accounting-db";
import {
  AUTO_EXPENSE,
  AUTO_EXPENSE_LABELS,
  MONEY_EPS,
  effectiveExpense,
  externalOrderTotal,
  paymentStatusOf,
  round2,
  siteOrderTotal,
  taxOf,
  type PaymentState,
} from "@/lib/order-money";
import { parseContact } from "@/lib/order-contact";
import { ORDER_STATUS, canChangeStatus, isOrderStatus, type OrderStatus } from "@/lib/order-status";

/**
 * Единый пересчёт денег заказа.
 *
 * Итог заказа, доход, расход, налог и статус оплаты лежат в трёх местах:
 * сам заказ (orders / external_orders), бухгалтерская карточка
 * (orders_accounting) и платежи (order_payments). Раньше каждое действие
 * обновляло свою часть - правка позиций не трогала статус оплаты,
 * срочность не меняла итог, списание материала дописывало расход поверх
 * оценки. Теперь любое действие, задевающее деньги, зовёт
 * recalcOrderMoney в своей транзакции, и всё считается заново из
 * первичных строк: позиций, расходов и платежей.
 *
 * Модуль не знает о текущем пользователе и правах - их проверяет
 * серверное действие. Поэтому его можно звать из проверочных скриптов.
 */

export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type OrderRef = { source: "site" | "external"; id: number };

/** Отказ по правилу (переход статуса, удаление) - текст показывается человеку. */
export class MoneyRuleError extends Error {}

export type MoneySummary = {
  cardId: number;
  ref: OrderRef | null;
  income: number;
  paid: number;
  totalExpense: number;
  estimatedExpense: number;
  tax: number;
  status: PaymentState;
  isCancelled: boolean;
  /**
   * Скидка заказа менеджера больше суммы позиций, и итог обрезан до нуля.
   * Действие, которое к этому привело, должно отказать, а не молча
   * записать нулевой заказ.
   */
  totalClamped: boolean;
};

export type RecalcOptions = {
  /**
   * Пересобрать итог заказа из позиций (и срочности / корректировки).
   * Нужно, только когда их правят. При платеже, расходе или смене статуса
   * берём сохранённый итог: он зафиксирован при оформлении, а у
   * перенесённых со старого сайта заказов contact_info бывает в другом
   * формате, и пересборка молча поменяла бы сумму, которую клиент уже
   * видел в счёте.
   */
  rebuildTotal?: boolean;
  /**
   * Пересчитать строку расчётной себестоимости. Нужно, когда поменялся
   * состав заказа. При платеже или ручном расходе оценку не трогаем:
   * иначе она молча переписывалась бы по сегодняшним ценам материалов.
   */
  refreshEstimate?: boolean;
};

/*
 * Блокировки. Пересчёт берёт строку заказа, затем карточки с
 * FOR NO KEY UPDATE, а не FOR UPDATE: действия сначала вставляют
 * дочернюю строку (платёж, расход, позицию), и вставка по внешнему ключу
 * держит на родителе KEY SHARE. FOR UPDATE с ним конфликтует, и два
 * параллельных платежа ловили взаимную блокировку. NO KEY UPDATE с KEY
 * SHARE совместим, а между собой пересчёты всё равно идут по очереди -
 * второй ждёт первого и видит его строки.
 */

// ------------------------------------------------------------ итог заказа

/**
 * Итог заказа с сайта. Блокирует строку заказа первым же запросом, чтобы
 * два параллельных пересчёта шли по очереди (см. выше про блокировки).
 * Без `rebuild` итог берётся сохранённый.
 */
async function recalcSiteOrder(tx: Tx, orderId: number, rebuild: boolean) {
  const [order] = await tx
    .select({
      contactInfo: orders.contactInfo,
      isUrgent: orders.isUrgent,
      status: orders.status,
      totalPrice: orders.totalPrice,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("no key update")
    .limit(1);
  if (!order) return null;

  const contact = parseContact(order.contactInfo);
  if (!rebuild) {
    return {
      total: Number(order.totalPrice),
      cancelled: order.status === "cancelled",
      clientName: contact?.name ?? null,
      clamped: false,
    };
  }

  const [{ sum }] = await tx
    .select({ sum: sql<string>`coalesce(sum(${orderItems.price}), 0)` })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const promo = (contact?.promo ?? null) as { discount?: unknown } | null;
  const discount =
    typeof promo?.discount === "number" && Number.isFinite(promo.discount) ? promo.discount : 0;

  const { subtotal, fee, total } = siteOrderTotal({
    subtotal: Number(sum),
    urgent: Boolean(order.isUrgent),
    discount,
  });

  // В contact_info держим те же числа, что показываем: иначе карточка
  // заказа рассказывает про старую сумму до скидки и старую срочность
  let nextContact = order.contactInfo;
  if (order.contactInfo?.trim().startsWith("{")) {
    try {
      const json = JSON.parse(order.contactInfo) as Record<string, unknown>;
      json.original_total_price = subtotal;
      json.urgent_fee = fee;
      json.is_urgent = Boolean(order.isUrgent);
      nextContact = JSON.stringify(json);
    } catch {
      // не JSON - оставляем как есть, это тоже допустимый случай
    }
  }

  await tx
    .update(orders)
    .set({ totalPrice: total.toFixed(2), contactInfo: nextContact })
    .where(eq(orders.id, orderId));

  return {
    total,
    cancelled: order.status === "cancelled",
    clientName: contact?.name ?? null,
    clamped: false,
  };
}

/**
 * Итог заказа менеджера: сумма позиций плюс корректировка. Без `rebuild`
 * - сохранённый итог.
 */
async function recalcExternalOrder(tx: Tx, externalOrderId: number, rebuild: boolean) {
  const [order] = await tx
    .select({
      adjustment: externalOrders.adjustment,
      productionStatus: externalOrders.productionStatus,
      clientName: externalOrders.clientName,
      totalPrice: externalOrders.totalPrice,
    })
    .from(externalOrders)
    .where(eq(externalOrders.id, externalOrderId))
    .for("no key update")
    .limit(1);
  if (!order) return null;

  const cancelled = order.productionStatus === "cancelled";
  if (!rebuild) {
    return {
      total: Number(order.totalPrice),
      cancelled,
      clientName: order.clientName,
      clamped: false,
    };
  }

  const [{ sum }] = await tx
    .select({ sum: sql<string>`coalesce(sum(${externalOrderItems.price}), 0)` })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.externalOrderId, externalOrderId));

  const raw = Number(sum) + Number(order.adjustment);
  const total = externalOrderTotal(Number(sum), Number(order.adjustment));

  await tx
    .update(externalOrders)
    .set({ totalPrice: total.toFixed(2) })
    .where(eq(externalOrders.id, externalOrderId));

  return {
    total,
    cancelled,
    clientName: order.clientName,
    clamped: raw < -0.005,
  };
}

// ------------------------------------------------------------- карточка

/** Карточка заказа под блокировкой; если её нет - заводим. */
async function lockOrCreateCard(tx: Tx, ref: OrderRef, clientName: string | null) {
  const [card] = await tx
    .select({ id: ordersAccounting.id, estimated: ordersAccounting.estimatedExpense })
    .from(ordersAccounting)
    .where(
      ref.source === "site"
        ? eq(ordersAccounting.orderId, ref.id)
        : eq(ordersAccounting.externalOrderId, ref.id),
    )
    .orderBy(asc(ordersAccounting.id))
    .for("no key update")
    .limit(1);
  if (card) return { id: card.id, estimated: Number(card.estimated), created: false };

  // Заказ без карточки не виден ни в бухгалтерии, ни в аналитике - поэтому
  // пересчёт заводит её сам, а не надеется, что её создали при оформлении
  const [created] = await tx
    .insert(ordersAccounting)
    .values({
      source: ref.source,
      orderId: ref.source === "site" ? ref.id : null,
      externalOrderId: ref.source === "external" ? ref.id : null,
      clientName,
    })
    .returning({ id: ordersAccounting.id });
  return { id: created.id, estimated: 0, created: true };
}

/**
 * Строка расчётной себестоимости. Переписываем её, только если оценка
 * действительно изменилась: у перенесённых заказов она разбита на
 * несколько строк старого сайта с той же суммой, и трогать их без нужды
 * незачем.
 */
async function refreshEstimate(tx: Tx, cardId: number, ref: OrderRef) {
  const estimate =
    ref.source === "site"
      ? await estimatedExpenseForOrder(tx, ref.id)
      : await estimatedExpense(tx, ref.id);

  const autoRows = await tx
    .select({ id: orderExpenses.id, amount: orderExpenses.amount })
    .from(orderExpenses)
    .where(
      and(
        eq(orderExpenses.orderAccountingId, cardId),
        inArray(orderExpenses.description, AUTO_EXPENSE_LABELS),
      ),
    );
  const current = round2(autoRows.reduce((s, r) => s + Number(r.amount), 0));

  if (Math.abs(current - estimate) > MONEY_EPS) {
    if (autoRows.length > 0) {
      await tx.delete(orderExpenses).where(
        inArray(
          orderExpenses.id,
          autoRows.map((r) => r.id),
        ),
      );
    }
    if (estimate > 0) {
      await tx.insert(orderExpenses).values({
        orderAccountingId: cardId,
        amount: estimate.toFixed(2),
        description: AUTO_EXPENSE,
      });
    }
  }

  return estimate;
}

/** Итоги карточки из её строк: расход, налог, оплата, отмена. */
async function finishCard(
  tx: Tx,
  cardId: number,
  input: {
    ref: OrderRef | null;
    income: number;
    isCancelled: boolean;
    estimated: number;
    totalClamped?: boolean;
  },
): Promise<MoneySummary> {
  const rows = await tx
    .select({
      amount: orderExpenses.amount,
      description: orderExpenses.description,
      isWriteOff: orderExpenses.isWriteOff,
    })
    .from(orderExpenses)
    .where(eq(orderExpenses.orderAccountingId, cardId));

  const [{ paid }] = await tx
    .select({ paid: sql<string>`coalesce(sum(${orderPayments.amount}), 0)` })
    .from(orderPayments)
    .where(eq(orderPayments.orderAccountingId, cardId));

  const income = round2(input.income);
  const paidSum = round2(Number(paid));
  const totalExpense = effectiveExpense(rows);
  const tax = taxOf(income, await taxRate(tx));
  const status = paymentStatusOf(income, paidSum);

  await tx
    .update(ordersAccounting)
    .set({
      income: income.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      estimatedExpense: input.estimated.toFixed(2),
      taxAmount: tax.toFixed(2),
      status,
      isCancelled: input.isCancelled,
    })
    .where(eq(ordersAccounting.id, cardId));

  // Статус оплаты заказа менеджера - копия статуса карточки: по нему
  // фильтруется список заказов и его видит клиент в кабинете. Руками его
  // больше не выбирают
  if (input.ref?.source === "external") {
    await tx
      .update(externalOrders)
      .set({ status })
      .where(eq(externalOrders.id, input.ref.id));
  }

  return {
    cardId,
    ref: input.ref,
    income,
    paid: paidSum,
    totalExpense,
    estimatedExpense: input.estimated,
    tax,
    status,
    isCancelled: input.isCancelled,
    totalClamped: input.totalClamped ?? false,
  };
}

/**
 * Пересчитать деньги заказа: итог, карточку, статус оплаты, отмену.
 *
 * Звать в той же транзакции, что и правку, которая их задела. Карточки
 * нет - заводится. Заказа нет - null.
 */
export async function recalcOrderMoney(
  tx: Tx,
  ref: OrderRef,
  opts: RecalcOptions = {},
): Promise<MoneySummary | null> {
  const rebuild = opts.rebuildTotal ?? false;
  const order =
    ref.source === "site"
      ? await recalcSiteOrder(tx, ref.id, rebuild)
      : await recalcExternalOrder(tx, ref.id, rebuild);
  if (!order) return null;

  const card = await lockOrCreateCard(tx, ref, order.clientName);
  const estimated =
    opts.refreshEstimate || card.created
      ? await refreshEstimate(tx, card.id, ref)
      : card.estimated;

  return finishCard(tx, card.id, {
    ref,
    income: order.total,
    isCancelled: order.cancelled,
    estimated,
    totalClamped: order.clamped,
  });
}

/**
 * Пересчёт по номеру карточки - для бухгалтерии, где правят строки
 * расходов и платежей.
 *
 * Карточку без заказа (заказ удалили до того, как удаление стало
 * запрещено) считаем отменённой: заказа нет, и в выручке ему не место.
 */
export async function recalcCard(
  tx: Tx,
  cardId: number,
  opts: RecalcOptions = {},
): Promise<MoneySummary | null> {
  // Без блокировки: её берёт recalcOrderMoney - сперва заказ, потом
  // карточку. Взять здесь карточку раньше заказа - путь к взаимной
  // блокировке с параллельной правкой заказа
  const [card] = await tx
    .select({
      orderId: ordersAccounting.orderId,
      externalOrderId: ordersAccounting.externalOrderId,
    })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.id, cardId))
    .limit(1);
  if (!card) return null;

  if (card.orderId !== null) {
    return recalcOrderMoney(tx, { source: "site", id: card.orderId }, opts);
  }
  if (card.externalOrderId !== null) {
    return recalcOrderMoney(tx, { source: "external", id: card.externalOrderId }, opts);
  }

  const [orphan] = await tx
    .select({ income: ordersAccounting.income, estimated: ordersAccounting.estimatedExpense })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.id, cardId))
    .for("no key update")
    .limit(1);
  if (!orphan) return null;

  return finishCard(tx, cardId, {
    ref: null,
    income: Number(orphan.income),
    isCancelled: true,
    estimated: Number(orphan.estimated),
  });
}

// ---------------------------------------------------------------- платежи

/**
 * Платёж по карточке и пересчёт.
 *
 * Со ссылкой на счёт Точки вставка идемпотентна: уникальный индекс не
 * даст завести второй платёж по тому же счёту, сколько бы раз ни
 * запускали сверку. Тогда `paymentId` - null.
 */
export async function addOrderPayment(
  tx: Tx,
  cardId: number,
  input: { amount: number; paidAt: Date; note?: string | null; tochkaInvoiceId?: number | null },
) {
  const values = {
    orderAccountingId: cardId,
    amount: round2(input.amount).toFixed(2),
    note: input.note ?? null,
    paidAt: input.paidAt,
    paymentDate: input.paidAt,
    tochkaInvoiceId: input.tochkaInvoiceId ?? null,
  };

  const inserted =
    input.tochkaInvoiceId != null
      ? await tx
          .insert(orderPayments)
          .values(values)
          .onConflictDoNothing({ target: orderPayments.tochkaInvoiceId })
          .returning({ id: orderPayments.id })
      : await tx.insert(orderPayments).values(values).returning({ id: orderPayments.id });

  const summary = await recalcCard(tx, cardId);
  return { paymentId: inserted[0]?.id ?? null, summary };
}

/**
 * Оплаченный счёт Точки → платёж в карточку заказа.
 *
 * Счёт связан только с сайтовым заказом (tochka_invoices.order_id ведёт в
 * orders) - у заказов менеджера связи со счетами банка нет. Счёт без
 * заказа деньги в карточку не приносит: непонятно, за что они.
 */
export async function applyPaidTochkaInvoice(tx: Tx, invoiceId: number) {
  const [inv] = await tx
    .select({
      id: tochkaInvoices.id,
      documentId: tochkaInvoices.documentId,
      orderId: tochkaInvoices.orderId,
      amount: tochkaInvoices.amount,
      status: tochkaInvoices.paymentStatus,
      paidAt: tochkaInvoices.paidAt,
    })
    .from(tochkaInvoices)
    .where(eq(tochkaInvoices.id, invoiceId))
    .limit(1);
  if (!inv || inv.status !== "paid" || inv.orderId === null) return null;

  const amount = Number(inv.amount);
  if (!(amount > 0)) return null;

  // Карточку берём через пересчёт: он же её и заведёт, если её нет
  const card = await recalcOrderMoney(tx, { source: "site", id: inv.orderId });
  if (!card) return null;

  const { paymentId, summary } = await addOrderPayment(tx, card.cardId, {
    amount,
    paidAt: inv.paidAt ?? new Date(),
    note: `Оплата счёта Точки № ${inv.documentId}`,
    tochkaInvoiceId: inv.id,
  });

  return { orderId: inv.orderId, amount, paymentId, summary };
}

// ------------------------------------------------------- действия с заказом

/** Срочность заказа с сайта: надбавка меняет итог, а за ним доход и налог. */
export async function setSiteOrderUrgent(tx: Tx, orderId: number, urgent: boolean) {
  const updated = await tx
    .update(orders)
    .set({ isUrgent: urgent })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });
  if (updated.length === 0) return null;
  return recalcOrderMoney(tx, { source: "site", id: orderId }, { rebuildTotal: true });
}

/**
 * Смена статуса заказа (у заказа менеджера - производственного).
 *
 * Проверяет таблицу переходов. Тот же статус - ничего не меняет и
 * возвращает changed: false, чтобы действие не слало клиенту письмо о
 * «новой» стадии. Отмена гасит производство и выводит карточку из
 * выручки; снятие отмены возвращает производство на паузу - запустить
 * его заново нельзя (дубль на доске), а продолжить с паузы можно.
 */
export async function changeOrderStatus(
  tx: Tx,
  ref: OrderRef,
  next: OrderStatus,
  opts: {
    /**
     * Переход делает система (производство: запуск - «в работе»,
     * последний этап - «завершён»), а не человек из списка. Таблица
     * переходов для неё не действует - цех уже сделал работу, - кроме
     * одного: отменённый заказ производство не оживляет.
     */
    system?: boolean;
  } = {},
) {
  const [row] =
    ref.source === "site"
      ? await tx
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, ref.id))
          .for("no key update")
          .limit(1)
      : await tx
          .select({ status: externalOrders.productionStatus })
          .from(externalOrders)
          .where(eq(externalOrders.id, ref.id))
          .for("no key update")
          .limit(1);
  if (!row) throw new MoneyRuleError("Заказ не найден");

  const from: OrderStatus = isOrderStatus(row.status) ? row.status : "pending";
  if (opts.system && from === "cancelled" && next !== "cancelled") {
    throw new MoneyRuleError("Заказ отменён - сначала снимите отмену");
  }
  if (!opts.system && !canChangeStatus(from, next)) {
    throw new MoneyRuleError(
      `Из статуса «${ORDER_STATUS[from].label}» в «${ORDER_STATUS[next].label}» перевести нельзя`,
    );
  }
  if (from === next) return { changed: false as const, from };

  if (ref.source === "site") {
    // Заказ увидели - метка «новый» больше не нужна
    await tx.update(orders).set({ status: next, isNew: false }).where(eq(orders.id, ref.id));
  } else {
    await tx
      .update(externalOrders)
      .set({ productionStatus: next })
      .where(eq(externalOrders.id, ref.id));
  }

  const ofOrder =
    ref.source === "site"
      ? eq(productionOrders.orderId, ref.id)
      : eq(productionOrders.externalOrderId, ref.id);

  if (next === "cancelled") {
    // Готовое производство не трогаем: оно уже случилось, и отменённый
    // заказ это не отменяет
    await tx
      .update(productionOrders)
      .set({ status: "cancelled", currentStageId: null })
      .where(and(ofOrder, notInArray(productionOrders.status, ["completed", "cancelled"])));
  } else if (from === "cancelled") {
    await tx
      .update(productionOrders)
      .set({ status: "on_hold" })
      .where(and(ofOrder, eq(productionOrders.status, "cancelled")));
  }

  await recalcOrderMoney(tx, ref);
  return { changed: true as const, from };
}

/**
 * Удаление заказа менеджера вместе с его карточкой.
 *
 * Если по заказу прошли деньги или со склада ушёл материал, удалять
 * нельзя: пропала бы история денег и движений склада. Такой заказ
 * отменяют. Раньше карточка оставалась сиротой и продолжала считаться в
 * выручке.
 */
export async function deleteExternalOrderChecked(tx: Tx, externalOrderId: number) {
  const [order] = await tx
    .select({ id: externalOrders.id })
    .from(externalOrders)
    .where(eq(externalOrders.id, externalOrderId))
    .for("update")
    .limit(1);
  if (!order) throw new MoneyRuleError("Заказ не найден");

  // Карточки - под FOR UPDATE: он конфликтует с KEY SHARE, который берёт
  // вставка платежа. Параллельный платёж дождётся удаления и упадёт на
  // внешнем ключе, а не пропадёт вместе с карточкой незамеченным
  const cards = await tx
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.externalOrderId, externalOrderId))
    .for("update");
  const cardIds = cards.map((c) => c.id);

  const [payments] = cardIds.length
    ? await tx
        .select({ n: count() })
        .from(orderPayments)
        .where(inArray(orderPayments.orderAccountingId, cardIds))
    : [{ n: 0 }];
  const [writeOffRows] = cardIds.length
    ? await tx
        .select({ n: count() })
        .from(orderExpenses)
        .where(
          and(
            inArray(orderExpenses.orderAccountingId, cardIds),
            eq(orderExpenses.isWriteOff, true),
          ),
        )
    : [{ n: 0 }];
  // Списание бесплатного материала строки расхода не оставляет - смотрим
  // и движения склада по этому заказу
  const [movements] = await tx
    .select({ n: count() })
    .from(materialsMovements)
    .where(
      and(
        eq(materialsMovements.referenceType, "order"),
        eq(materialsMovements.referenceId, externalOrderId),
        eq(materialsMovements.type, "out"),
      ),
    );

  if (Number(payments.n) > 0 || Number(writeOffRows.n) > 0 || Number(movements.n) > 0) {
    throw new MoneyRuleError("Есть платежи/списания - отмените заказ вместо удаления");
  }

  if (cardIds.length > 0) {
    await tx.delete(ordersAccounting).where(inArray(ordersAccounting.id, cardIds));
  }
  await tx.delete(externalOrders).where(eq(externalOrders.id, externalOrderId));
  return { cardIds };
}

/**
 * Фактическое списание материала - строкой расхода с признаком списания.
 * После неё расчётная себестоимость перестаёт входить в расход заказа
 * (см. effectiveExpense).
 */
export async function recordWriteOffExpense(
  tx: Tx,
  externalOrderId: number,
  input: {
    materialName: string;
    quantity: string;
    unit: string | null;
    costPerUnit: string | null;
    cost: number;
  },
) {
  const ref: OrderRef = { source: "external", id: externalOrderId };
  const before = await recalcOrderMoney(tx, ref);
  if (!before) return null;

  await tx.insert(orderExpenses).values({
    orderAccountingId: before.cardId,
    materialName: input.materialName,
    quantity: input.quantity,
    unit: input.unit,
    costPerUnit: input.costPerUnit,
    totalCost: input.cost.toFixed(2),
    amount: input.cost.toFixed(2),
    description: `Списано со склада: ${input.materialName}`,
    isWriteOff: true,
  });

  return recalcOrderMoney(tx, ref);
}

// ------------------------------------------------------------------ отчёты

/**
 * Сколько нам должны: доход минус платежи по каждой карточке, без
 * отменённых. Раньше долгом считали полную сумму неоплаченных заказов -
 * частично оплаченный заказ на 100 000 при оплаченных 90 000 висел
 * долгом на все 100 000. И считали только заказы менеджера.
 *
 * `filter` - дополнительное условие на orders_accounting (период).
 */
export async function openDebt(filter?: SQL) {
  const cardPaid = db
    .select({
      cardId: orderPayments.orderAccountingId,
      paid: sql<string>`sum(${orderPayments.amount})`.as("paid"),
    })
    .from(orderPayments)
    .groupBy(orderPayments.orderAccountingId)
    .as("card_paid");

  // Имена колонок в списке выборки пишем с таблицей сами: Drizzle выводит
  // их здесь без имени таблицы, а в соединении это уже неоднозначно
  const [row] = await db
    .select({
      n: sql<number>`(count(*) filter (where orders_accounting.income - coalesce(card_paid.paid, 0) > ${MONEY_EPS}))::int`,
      debt: sql<string>`coalesce(sum(greatest(orders_accounting.income - coalesce(card_paid.paid, 0), 0)), 0)`,
      paid: sql<string>`coalesce(sum(card_paid.paid), 0)`,
    })
    .from(ordersAccounting)
    .leftJoin(cardPaid, eq(cardPaid.cardId, ordersAccounting.id))
    .where(and(eq(ordersAccounting.isCancelled, false), filter));

  return {
    n: Number(row?.n ?? 0),
    debt: Number(row?.debt ?? 0),
    paid: Number(row?.paid ?? 0),
  };
}
