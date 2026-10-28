import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  externalOrderItems,
  materials,
  orderItems,
  productMaterials,
  settings,
} from "@/db/schema";
import { round2 } from "@/lib/order-money";

/**
 * Оценки для бухгалтерской карточки заказа: ставка налога и расчётная
 * себестоимость. Саму карточку (доход, расход, налог, статус оплаты)
 * пересчитывает только recalcOrderMoney из `order-money-db.ts` - раньше
 * каждое действие обновляло свою часть, и они расходились.
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

/** Стоимость материалов на единицу товара по его рецептуре. */
async function recipeCost(tx: Tx, productIds: number[]) {
  const costOf = new Map<number, number>();
  if (productIds.length === 0) return costOf;

  const recipes = await tx
    .select({
      productId: productMaterials.productId,
      perUnit: productMaterials.quantityPerUnit,
      cost: materials.costPerUnit,
    })
    .from(productMaterials)
    .innerJoin(materials, eq(materials.id, productMaterials.materialId))
    .where(inArray(productMaterials.productId, productIds));

  for (const r of recipes) {
    costOf.set(
      r.productId,
      (costOf.get(r.productId) ?? 0) + Number(r.perUnit) * Number(r.cost ?? 0),
    );
  }
  return costOf;
}

/**
 * Во что заказ менеджера обойдётся по расходникам.
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
  const costOf = await recipeCost(tx, productIds);
  for (const i of items) {
    if (i.productId === null) continue;
    total += (costOf.get(i.productId) ?? 0) * i.quantity;
  }

  return round2(total);
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
  const costOf = await recipeCost(tx, productIds);

  let total = 0;
  for (const i of items) {
    if (i.productId === null) continue;
    total += (costOf.get(i.productId) ?? 0) * i.quantity;
  }

  return round2(total);
}
