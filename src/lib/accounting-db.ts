import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  externalOrderItems,
  externalOrders,
  materials,
  orderExpenses,
  orderItems,
  orders,
  ordersAccounting,
  productMaterials,
  settings,
} from "@/db/schema";

/**
 * Бухгалтерская карточка заказа.
 *
 * На каждый заказ заводится строка в orders_accounting: из неё живут
 * бухгалтерия и аналитика. Старый сайт заводил её той же транзакцией,
 * что и сам заказ, - иначе заказ есть, а в деньгах его нет.
 */

/** Внутри транзакции у Drizzle свой объект - принимаем и его, и обычный db. */
type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Ставка налога в процентах. Хранится в settings, по умолчанию УСН 6 %. */
export async function taxRate(tx: Tx = db) {
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.name, "tax_rate"))
    .limit(1);

  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 6;
}

/** Деньги в копейках, чтобы сложение не набирало хвост из-за double. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Описание строки расхода, которую заводим сами. По нему её и находим
 * при пересчёте - остальные строки вписаны руками и трогать их нельзя.
 */
const AUTO_EXPENSE = "Расчётная себестоимость по позициям заказа";

/**
 * Как ту же строку подписывал старый сайт.
 *
 * Без этих вариантов первый же пересчёт перенесённого заказа не находил
 * старую строку, оставлял её и дописывал свою - себестоимость удваивалась.
 */
const LEGACY_AUTO_EXPENSE = [
  "Автоматический расчет себестоимости материалов",
  "Автоматический расчет себестоимости материалов (коррекция внеш.)",
];

/** Строки автоматического расчёта - свои и унаследованные. */
const autoExpenseRows = (cardId: number) =>
  and(
    eq(orderExpenses.orderAccountingId, cardId),
    inArray(orderExpenses.description, [AUTO_EXPENSE, ...LEGACY_AUTO_EXPENSE]),
  );

/**
 * Во что заказ обойдётся по расходникам.
 *
 * Складывает материалы товаров из каталога и то, что менеджер вписал
 * руками в позиции. Позиции без товара своих материалов не имеют -
 * там считается только вписанная сумма.
 */
export async function estimatedExpense(tx: Tx, externalOrderId: number) {
  const items = await tx
    .select({
      productId: externalOrderItems.productId,
      quantity: externalOrderItems.quantity,
      expense: externalOrderItems.expenseAmount,
    })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.externalOrderId, externalOrderId));

  let total = items.reduce((s, i) => s + Number(i.expense), 0);

  const productIds = [...new Set(items.map((i) => i.productId).filter((v) => v !== null))];
  if (productIds.length > 0) {
    const recipes = await tx
      .select({
        productId: productMaterials.productId,
        perUnit: productMaterials.quantityPerUnit,
        cost: materials.costPerUnit,
      })
      .from(productMaterials)
      .innerJoin(materials, eq(materials.id, productMaterials.materialId))
      .where(inArray(productMaterials.productId, productIds));

    const costOf = new Map<number, number>();
    for (const r of recipes) {
      costOf.set(
        r.productId,
        (costOf.get(r.productId) ?? 0) + Number(r.perUnit) * Number(r.cost ?? 0),
      );
    }

    for (const i of items) {
      if (i.productId === null) continue;
      total += (costOf.get(i.productId) ?? 0) * i.quantity;
    }
  }

  return round2(total);
}

/**
 * Завести карточку под заказ менеджера и сразу записать расчётную
 * себестоимость отдельной строкой расхода - так её видно в карточке
 * заказа, а не только числом в итоге.
 */
export async function createAccountingForExternalOrder(
  tx: Tx,
  order: { id: number; clientName: string; income: string; status: string },
) {
  const expense = await estimatedExpense(tx, order.id);
  const rate = await taxRate(tx);
  const tax = round2(Number(order.income) * (rate / 100));

  const [card] = await tx
    .insert(ordersAccounting)
    .values({
      source: "external",
      externalOrderId: order.id,
      clientName: order.clientName,
      income: order.income,
      totalExpense: expense.toFixed(2),
      estimatedExpense: expense.toFixed(2),
      taxAmount: tax.toFixed(2),
      status: order.status === "paid" ? "paid" : order.status === "partial" ? "partial" : "unpaid",
    })
    .returning({ id: ordersAccounting.id });

  if (expense > 0) {
    await tx.insert(orderExpenses).values({
      orderAccountingId: card.id,
      amount: expense.toFixed(2),
      description: AUTO_EXPENSE,
    });
  }

  return card.id;
}

/**
 * Пересчитать карточку после правки состава заказа.
 *
 * Расходы, вписанные бухгалтером руками, не трогаем: пересчитываем
 * только строку расчётной себестоимости - ту самую, которую завели при
 * создании заказа.
 */
export async function syncAccountingForExternalOrder(tx: Tx, externalOrderId: number) {
  const [card] = await tx
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.externalOrderId, externalOrderId))
    .limit(1);
  if (!card) return;

  const [order] = await tx
    .select({
      income: externalOrders.totalPrice,
      status: externalOrders.status,
      clientName: externalOrders.clientName,
    })
    .from(externalOrders)
    .where(eq(externalOrders.id, externalOrderId))
    .limit(1);
  if (!order) return;

  const expense = await estimatedExpense(tx, externalOrderId);
  const rate = await taxRate(tx);
  const tax = round2(Number(order.income) * (rate / 100));

  await tx.delete(orderExpenses).where(autoExpenseRows(card.id));

  if (expense > 0) {
    await tx.insert(orderExpenses).values({
      orderAccountingId: card.id,
      amount: expense.toFixed(2),
      description: AUTO_EXPENSE,
    });
  }

  // Итог по расходам - сумма всех строк, включая вписанные руками
  const [{ sum }] = await tx
    .select({ sum: sql<string>`coalesce(sum(${orderExpenses.amount}), 0)` })
    .from(orderExpenses)
    .where(eq(orderExpenses.orderAccountingId, card.id));

  await tx
    .update(ordersAccounting)
    .set({
      clientName: order.clientName,
      income: order.income,
      estimatedExpense: expense.toFixed(2),
      totalExpense: Number(sum).toFixed(2),
      taxAmount: tax.toFixed(2),
      status:
        order.status === "paid" ? "paid" : order.status === "partial" ? "partial" : "unpaid",
    })
    .where(eq(ordersAccounting.id, card.id));
}

/**
 * Себестоимость заказа с сайта по рецептуре товаров.
 *
 * У сайтовых позиций своего поля затрат нет - там всё считается по
 * материалам товара, как и на старом сайте.
 */
export async function estimatedExpenseForOrder(tx: Tx, orderId: number) {
  const items = await tx
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const productIds = [...new Set(items.map((i) => i.productId).filter((v) => v !== null))];
  if (productIds.length === 0) return 0;

  const recipes = await tx
    .select({
      productId: productMaterials.productId,
      perUnit: productMaterials.quantityPerUnit,
      cost: materials.costPerUnit,
    })
    .from(productMaterials)
    .innerJoin(materials, eq(materials.id, productMaterials.materialId))
    .where(inArray(productMaterials.productId, productIds));

  const costOf = new Map<number, number>();
  for (const r of recipes) {
    costOf.set(
      r.productId,
      (costOf.get(r.productId) ?? 0) + Number(r.perUnit) * Number(r.cost ?? 0),
    );
  }

  let total = 0;
  for (const i of items) {
    if (i.productId === null) continue;
    total += (costOf.get(i.productId) ?? 0) * i.quantity;
  }

  return round2(total);
}

/** Бухгалтерская карточка под заказ с сайта. */
export async function createAccountingForSiteOrder(
  tx: Tx,
  order: { id: number; clientName: string; income: string },
) {
  const expense = await estimatedExpenseForOrder(tx, order.id);
  const rate = await taxRate(tx);
  const tax = round2(Number(order.income) * (rate / 100));

  const [card] = await tx
    .insert(ordersAccounting)
    .values({
      source: "site",
      orderId: order.id,
      clientName: order.clientName,
      income: order.income,
      totalExpense: expense.toFixed(2),
      estimatedExpense: expense.toFixed(2),
      taxAmount: tax.toFixed(2),
      status: "unpaid",
    })
    .returning({ id: ordersAccounting.id });

  if (expense > 0) {
    await tx.insert(orderExpenses).values({
      orderAccountingId: card.id,
      amount: expense.toFixed(2),
      description: AUTO_EXPENSE,
    });
  }

  return card.id;
}

/**
 * Пересчитать карточку заказа с сайта после правки состава.
 *
 * Как и у менеджерских заказов, трогаем только строку расчётной
 * себестоимости: расходы, вписанные бухгалтером руками, остаются.
 */
export async function syncAccountingForSiteOrder(tx: Tx, orderId: number) {
  const [card] = await tx
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.orderId, orderId))
    .limit(1);
  if (!card) return;

  const [order] = await tx
    .select({ income: orders.totalPrice })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return;

  const expense = await estimatedExpenseForOrder(tx, orderId);
  const rate = await taxRate(tx);
  const tax = round2(Number(order.income) * (rate / 100));

  await tx.delete(orderExpenses).where(autoExpenseRows(card.id));

  if (expense > 0) {
    await tx.insert(orderExpenses).values({
      orderAccountingId: card.id,
      amount: expense.toFixed(2),
      description: AUTO_EXPENSE,
    });
  }

  const [{ sum }] = await tx
    .select({ sum: sql<string>`coalesce(sum(${orderExpenses.amount}), 0)` })
    .from(orderExpenses)
    .where(eq(orderExpenses.orderAccountingId, card.id));

  await tx
    .update(ordersAccounting)
    .set({
      income: order.income,
      estimatedExpense: expense.toFixed(2),
      totalExpense: Number(sum).toFixed(2),
      taxAmount: tax.toFixed(2),
    })
    .where(eq(ordersAccounting.id, card.id));
}
