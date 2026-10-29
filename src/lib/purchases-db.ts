import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  expensesCategories,
  generalExpenses,
  materials,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
} from "@/db/schema";
import { applyMovement } from "@/lib/stock";
import {
  RECEIVABLE,
  landedUnitPrice,
  purchasePaymentState,
  weightedUnitCost,
  type PurchaseStatus,
} from "@/lib/purchases";
import { localDate } from "@/lib/dates";
import type { Tx } from "@/lib/order-money-db";

/**
 * Закупки: приёмка на склад и оплата.
 *
 * Здесь, а не в серверных действиях, чтобы проверочный скрипт мог пройти
 * весь путь без сессии и прав. Права проверяет действие.
 */

/** Отказ по правилу - текст показывается человеку. */
export class PurchaseRuleError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Название категории общих расходов, под которой закупки попадают в бухгалтерию. */
export const PURCHASE_EXPENSE_CATEGORY = "Закупка материалов";

// ------------------------------------------------------------------ приёмка

/**
 * Приёмка позиции закупки на склад.
 *
 * Помимо остатка обновляет цену материала средневзвешенно: раньше
 * `materials.cost_per_unit` не менялась никогда, и списания на заказы
 * считались по цене, которую вписали при заведении материала, - сколько
 * бы ни стоила последняя закупка.
 *
 * Цена прихода включает долю доставки закупки (см. landedUnitPrice).
 */
export async function receivePurchaseItem(
  tx: Tx,
  input: { itemId: number; quantity: string },
) {
  const amount = Number(input.quantity);

  // Сначала закупка, потом позиция. Закупку блокируем первой: две
  // одновременные приёмки последних позиций иначе считали статус каждая по
  // своему снимку («ещё не всё принято») и закупка застревала в «Принята
  // частично». Под блокировкой вторая приёмка видит результат первой
  const [ref] = await tx
    .select({ purchaseOrderId: purchaseOrderItems.purchaseOrderId })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.id, input.itemId))
    .limit(1);
  if (!ref) throw new PurchaseRuleError("Позиция не найдена");

  const [order] = await tx
    .select({
      status: purchaseOrders.status,
      number: purchaseOrders.orderNumber,
      shipping: purchaseOrders.shippingCost,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, ref.purchaseOrderId))
    .for("no key update")
    .limit(1);

  if (!order || !RECEIVABLE.includes((order.status ?? "draft") as PurchaseStatus)) {
    throw new PurchaseRuleError("Эту закупку сейчас нельзя принимать");
  }

  const [item] = await tx
    .select({
      id: purchaseOrderItems.id,
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      materialId: purchaseOrderItems.materialId,
      ordered: purchaseOrderItems.quantity,
      received: purchaseOrderItems.receivedQuantity,
      unitPrice: purchaseOrderItems.unitPrice,
      totalPrice: purchaseOrderItems.totalPrice,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.id, input.itemId))
    .for("update")
    .limit(1);
  if (!item) throw new PurchaseRuleError("Позиция не найдена");

  const already = Number(item.received ?? 0);
  const ordered = Number(item.ordered);

  // Принять больше заказанного - почти всегда опечатка, и она
  // молча раздувает остаток на складе
  if (already + amount > ordered + 0.0001) {
    throw new PurchaseRuleError(
      `Уже принято ${already} из ${ordered}. Больше заказанного принять нельзя`,
    );
  }

  const moved = await applyMovement(tx, {
    materialId: item.materialId,
    type: "in",
    quantity: input.quantity,
    referenceType: "purchase",
    referenceId: item.purchaseOrderId,
    comment: `Приёмка по закупке ${order.number}`,
  });

  // Цену читаем после applyMovement: он держит блокировку строки остатка,
  // и две одновременные приёмки одного материала считают среднее по
  // очереди, а не обе от одной и той же старой цены
  const [material] = await tx
    .select({ cost: materials.costPerUnit })
    .from(materials)
    .where(eq(materials.id, item.materialId))
    .limit(1);
  const oldCost = material?.cost == null ? null : Number(material.cost);

  const all = await tx
    .select({ total: purchaseOrderItems.totalPrice })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, item.purchaseOrderId));
  const goodsTotal = all.reduce((s, r) => s + Number(r.total ?? 0), 0);

  const price = landedUnitPrice({
    unitPrice: Number(item.unitPrice),
    itemTotal: Number(item.totalPrice ?? Number(item.unitPrice) * ordered),
    goodsTotal,
    shipping: Number(order.shipping ?? 0),
    quantity: ordered,
  });

  const newCost = weightedUnitCost({
    stock: moved.previous,
    oldCost,
    received: amount,
    price,
  });

  if (newCost !== null && newCost !== oldCost) {
    await tx
      .update(materials)
      .set({ costPerUnit: newCost.toFixed(2) })
      .where(eq(materials.id, item.materialId));
  }

  await tx
    .update(purchaseOrderItems)
    .set({ receivedQuantity: (already + amount).toFixed(2) })
    .where(eq(purchaseOrderItems.id, input.itemId));

  // Статус закупки пересчитываем по всем позициям сразу: принята
  // целиком только когда каждая позиция закрыта полностью
  const rest = await tx
    .select({
      ordered: purchaseOrderItems.quantity,
      received: purchaseOrderItems.receivedQuantity,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, item.purchaseOrderId));

  const allDone = rest.every((r) => Number(r.received ?? 0) >= Number(r.ordered));
  const anyDone = rest.some((r) => Number(r.received ?? 0) > 0);

  await tx
    .update(purchaseOrders)
    .set({
      status: allDone ? "received" : anyDone ? "partially_received" : order.status,
      // Календарный день берём в поясе компании, иначе ночная
      // приёмка запишется вчерашним числом
      actualDeliveryDate: allDone ? localDate() : null,
    })
    .where(eq(purchaseOrders.id, item.purchaseOrderId));

  return {
    materialId: item.materialId,
    purchaseOrderId: item.purchaseOrderId,
    number: order.number,
    oldCost,
    newCost: newCost ?? oldCost,
    stockBefore: moved.previous,
    stockAfter: moved.current,
  };
}

// ------------------------------------------------------------------ оплата

/**
 * Категория «Закупка материалов» в общих расходах. Заводится при первой
 * оплате: справочник категорий общий, и заранее создавать её в базе
 * боевого сервера руками никто не будет. Под блокировкой, чтобы две
 * первые оплаты разом не завели две одинаковые категории.
 */
export async function purchaseExpenseCategory(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('purchase_expense_category'))`);
  const [found] = await tx
    .select({ id: expensesCategories.id })
    .from(expensesCategories)
    .where(eq(expensesCategories.name, PURCHASE_EXPENSE_CATEGORY))
    .orderBy(expensesCategories.id)
    .limit(1);
  if (found) return found.id;

  const [created] = await tx
    .insert(expensesCategories)
    .values({
      name: PURCHASE_EXPENSE_CATEGORY,
      description: "Оплата закупок у подрядчиков",
    })
    .returning({ id: expensesCategories.id });
  return created.id;
}

/**
 * Оплата закупки и общий расход - одной транзакцией.
 *
 * Расход заводится в общие (general_expenses): закупка материала не
 * принадлежит одному заказу, а без расхода закупка не попадала в
 * бухгалтерию вовсе. Сумма оплат = сумма расходов, привязанных к
 * закупке, поэтому статус оплаты считается из них, а не хранится
 * отдельным ручным полем.
 */
export async function addPurchasePayment(
  tx: Tx,
  input: { purchaseOrderId: number; amount: number; paidAt: Date },
) {
  const [order] = await tx
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.orderNumber,
      status: purchaseOrders.status,
      total: purchaseOrders.totalAmount,
      supplier: suppliers.name,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(eq(purchaseOrders.id, input.purchaseOrderId))
    .for("no key update", { of: purchaseOrders })
    .limit(1);
  if (!order) throw new PurchaseRuleError("Закупка не найдена");
  if (order.status === "cancelled") {
    throw new PurchaseRuleError("Закупка отменена - оплату не отмечают");
  }

  const amount = round2(input.amount);
  if (!(amount > 0)) throw new PurchaseRuleError("Сумма вида 1234.56, больше нуля");

  const total = Number(order.total ?? 0);
  const paidBefore = await paidSum(tx, order.id);
  // Переплату не принимаем: она почти всегда опечатка, а в расходах
  // осталась бы лишней суммой
  if (paidBefore + amount > total + 0.005) {
    throw new PurchaseRuleError(
      `Больше суммы закупки: к оплате осталось ${round2(Math.max(0, total - paidBefore)).toFixed(2)} ₽`,
    );
  }

  const categoryId = await purchaseExpenseCategory(tx);
  const [expense] = await tx
    .insert(generalExpenses)
    .values({
      amount: amount.toFixed(2),
      categoryId,
      purchaseOrderId: order.id,
      description: `Оплата закупки ${order.number}${order.supplier ? ` (${order.supplier})` : ""}`,
      expenseDate: input.paidAt,
    })
    .returning({ id: generalExpenses.id });

  const state = await recalcPurchasePayment(tx, order.id);
  return { expenseId: expense.id, number: order.number, ...state };
}

/**
 * Отмена оплаты: расход удаляется, статус пересчитывается. Единственный
 * способ убрать расход закупки из бухгалтерии - отдельно удалить его
 * нельзя, иначе сумма оплат на закупке разошлась бы с расходами.
 */
export async function removePurchasePayment(tx: Tx, expenseId: number) {
  const [expense] = await tx
    .select({
      id: generalExpenses.id,
      purchaseOrderId: generalExpenses.purchaseOrderId,
      amount: generalExpenses.amount,
    })
    .from(generalExpenses)
    .where(eq(generalExpenses.id, expenseId))
    .limit(1);
  if (!expense || expense.purchaseOrderId === null) {
    throw new PurchaseRuleError("Оплата не найдена");
  }

  // Закупку блокируем до удаления, как при добавлении оплаты
  await tx
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, expense.purchaseOrderId))
    .for("no key update");

  const removed = await tx
    .delete(generalExpenses)
    .where(and(eq(generalExpenses.id, expenseId), eq(generalExpenses.purchaseOrderId, expense.purchaseOrderId)))
    .returning({ id: generalExpenses.id });
  if (removed.length === 0) throw new PurchaseRuleError("Оплата не найдена");

  const state = await recalcPurchasePayment(tx, expense.purchaseOrderId);
  return { purchaseOrderId: expense.purchaseOrderId, amount: expense.amount, ...state };
}

async function paidSum(tx: Tx, purchaseOrderId: number) {
  const [row] = await tx
    .select({ paid: sql<string>`coalesce(sum(${generalExpenses.amount}), 0)` })
    .from(generalExpenses)
    .where(eq(generalExpenses.purchaseOrderId, purchaseOrderId));
  return Number(row?.paid ?? 0);
}

/** Сумма и статус оплаты закупки - из расходов, привязанных к ней. */
export async function recalcPurchasePayment(tx: Tx, purchaseOrderId: number) {
  const [order] = await tx
    .select({ total: purchaseOrders.totalAmount })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  const paid = round2(await paidSum(tx, purchaseOrderId));
  const status = purchasePaymentState(Number(order?.total ?? 0), paid);

  await tx
    .update(purchaseOrders)
    .set({ paidAmount: paid.toFixed(2), paymentStatus: status })
    .where(eq(purchaseOrders.id, purchaseOrderId));

  return { paid, status };
}

/**
 * Удаление общего расхода. Расход, заведённый оплатой закупки, удаляют
 * отменой оплаты на самой закупке: иначе сумма оплат закупки разошлась бы
 * с бухгалтерией. `null` - такого расхода нет.
 */
export async function deleteGeneralExpenseRow(tx: Tx, id: number) {
  const [row] = await tx
    .select({ purchaseOrderId: generalExpenses.purchaseOrderId })
    .from(generalExpenses)
    .where(eq(generalExpenses.id, id))
    .limit(1);
  if (!row) return null;
  if (row.purchaseOrderId !== null) {
    throw new PurchaseRuleError("Это оплата закупки - отмените её в разделе «Закупки»");
  }

  const removed = await tx
    .delete(generalExpenses)
    .where(and(eq(generalExpenses.id, id), sql`${generalExpenses.purchaseOrderId} is null`))
    .returning({ id: generalExpenses.id });
  return removed.length > 0 ? { id } : null;
}
