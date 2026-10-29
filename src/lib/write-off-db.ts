import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  externalOrders,
  materials,
  materialsMovements,
  materialsStock,
  orderExpenses,
  orders,
  ordersAccounting,
} from "@/db/schema";
import { applyMovement } from "@/lib/stock";
import {
  MoneyRuleError,
  recalcOrderMoney,
  recordWriteOffExpense,
  type OrderRef,
  type Tx,
} from "@/lib/order-money-db";
import { round2 } from "@/lib/order-money";

/**
 * Списание материала на заказ и возврат на склад.
 *
 * Здесь, а не в серверном действии, чтобы проверочный скрипт мог пройти
 * весь путь без сессии. Права проверяет действие.
 *
 * Номера заказов сайта и менеджера пересекаются (HANDOFF, п. 21), поэтому
 * движения склада различаются типом ссылки: 'order' - заказ менеджера
 * (так писали всегда), 'site_order' - заказ с сайта.
 */

export type WriteOffSource = "site" | "external";

const movementRefType = (source: WriteOffSource) =>
  source === "site" ? ("site_order" as const) : ("order" as const);

const orderLabel = (source: WriteOffSource, id: number) =>
  source === "site" ? `Заказ с сайта № ${id}` : `Заказ менеджера № ${id}`;

/** Заказ под блокировкой: статус нужен, чтобы не списывать на отменённый. */
async function lockOrder(tx: Tx, ref: OrderRef) {
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
  return row;
}

/**
 * Списать материал со склада на заказ.
 *
 * Движение уходит на склад, а его стоимость - отдельной строкой расхода
 * в бухгалтерию заказа (если у материала есть цена). Строка помнит
 * движение, поэтому списание можно вернуть.
 */
export async function writeOffToOrder(
  tx: Tx,
  ref: OrderRef,
  input: { materialId: number; quantity: string },
) {
  // Заказ - под блокировкой и до движения склада: иначе параллельное
  // удаление заказа оставило бы материал списанным «в никуда»
  const order = await lockOrder(tx, ref);
  if (order.status === "cancelled") {
    throw new MoneyRuleError("Заказ отменён - списывать на него нельзя");
  }

  const [material] = await tx
    .select({
      id: materials.id,
      name: materials.name,
      unit: materials.unit,
      cost: materials.costPerUnit,
      isActive: materials.isActive,
    })
    .from(materials)
    .where(eq(materials.id, input.materialId))
    .limit(1);
  if (!material) throw new MoneyRuleError("Материал не найден");
  // Отключённый материал в форме не предлагается, но номер приходит из
  // формы: сервер сам не принимает то, что выключено
  if (material.isActive === false) {
    throw new MoneyRuleError(`Материал «${material.name}» отключён - списывать его нельзя`);
  }

  const amount = Number(input.quantity);
  const cost = round2(amount * Number(material.cost ?? 0));

  const moved = await applyMovement(tx, {
    materialId: material.id,
    type: "out",
    quantity: input.quantity,
    referenceType: movementRefType(ref.source),
    referenceId: ref.id,
    comment: orderLabel(ref.source, ref.id),
  });

  // Фактический расход попадает в бухгалтерию заказа строкой с
  // признаком списания. Пока такие строки есть, расчётная
  // себестоимость в расход не входит: раньше их складывали, и
  // материал считался дважды - по рецептуре и по факту
  if (cost > 0) {
    await recordWriteOffExpense(tx, ref, {
      materialName: material.name,
      quantity: input.quantity,
      unit: material.unit,
      costPerUnit: material.cost,
      cost,
      movementId: moved.movementId,
    });
  }

  return { material, amount, cost, movementId: moved.movementId };
}

/**
 * Вернуть списание на склад: приход на тот же материал и то же
 * количество, строка расхода снимается, деньги заказа пересчитываются -
 * всё в одной транзакции. Раньше списание было необратимым: ошибочно
 * списанный материал оставался и в расходе заказа, и «уехавшим» со склада.
 *
 * На отменённый заказ возврат разрешён: материал, списанный на отменённый
 * заказ, как раз и надо вернуть.
 */
export async function returnWriteOff(tx: Tx, ref: OrderRef, movementId: number) {
  await lockOrder(tx, ref);

  const [movement] = await tx
    .select({
      id: materialsMovements.id,
      materialId: materialsMovements.materialId,
      type: materialsMovements.type,
      quantity: materialsMovements.quantity,
      referenceType: materialsMovements.referenceType,
      referenceId: materialsMovements.referenceId,
    })
    .from(materialsMovements)
    .where(eq(materialsMovements.id, movementId))
    .for("update")
    .limit(1);

  // Движение должно быть списанием именно с этого заказа: номер приходит
  // из формы, и без сверки можно «вернуть» чужое списание
  if (
    !movement ||
    movement.type !== "out" ||
    movement.referenceType !== movementRefType(ref.source) ||
    movement.referenceId !== ref.id
  ) {
    throw new MoneyRuleError("Списание не найдено");
  }

  const [already] = await tx
    .select({ id: materialsMovements.id })
    .from(materialsMovements)
    .where(eq(materialsMovements.reversesMovementId, movement.id))
    .limit(1);
  if (already) throw new MoneyRuleError("Это списание уже возвращено на склад");

  const expenseId = await findWriteOffExpense(tx, ref, {
    movementId: movement.id,
    quantity: movement.quantity,
  });

  await applyMovement(tx, {
    materialId: movement.materialId,
    type: "in",
    quantity: movement.quantity,
    referenceType: movementRefType(ref.source),
    referenceId: ref.id,
    comment: `Возврат по заказу: ${orderLabel(ref.source, ref.id)}`,
    reversesMovementId: movement.id,
  });

  if (expenseId !== null) {
    await tx.delete(orderExpenses).where(eq(orderExpenses.id, expenseId));
  }

  const summary = await recalcOrderMoney(tx, ref);
  return {
    materialId: movement.materialId,
    quantity: movement.quantity,
    expenseRemoved: expenseId !== null,
    summary,
  };
}

/**
 * Строка расхода этого списания. Сначала по ссылке на движение; у
 * списаний, сделанных до появления ссылки, - по времени создания: старое
 * списание писало движение и расход одной транзакцией, а `now()` в
 * Postgres - время начала транзакции, так что `created_at` у пары совпадает
 * точно. К времени добавлены заказ (карточка) и количество, самая ранняя
 * строка без ссылки. По названию материала не сверяем: его переименовывают,
 * и тогда расход осталась бы без пары навсегда. Нет строки - списание было
 * бесплатным (у материала не было цены), удалять нечего.
 */
async function findWriteOffExpense(
  tx: Tx,
  ref: OrderRef,
  movement: { movementId: number; quantity: string },
) {
  const [linked] = await tx
    .select({ id: orderExpenses.id })
    .from(orderExpenses)
    .where(eq(orderExpenses.materialMovementId, movement.movementId))
    .limit(1);
  if (linked) return linked.id;

  const [legacy] = await tx
    .select({ id: orderExpenses.id })
    .from(orderExpenses)
    .innerJoin(ordersAccounting, eq(ordersAccounting.id, orderExpenses.orderAccountingId))
    .where(
      and(
        ref.source === "site"
          ? eq(ordersAccounting.orderId, ref.id)
          : eq(ordersAccounting.externalOrderId, ref.id),
        eq(orderExpenses.isWriteOff, true),
        sql`${orderExpenses.materialMovementId} is null`,
        // Сравнение в самой базе: JS Date теряет микросекунды, и равные
        // в Postgres времена перестали бы совпадать
        sql`${orderExpenses.createdAt} = (select m.created_at from materials_movements m where m.id = ${movement.movementId})`,
        sql`${orderExpenses.quantity} = ${movement.quantity}::numeric`,
      ),
    )
    .orderBy(asc(orderExpenses.id))
    .limit(1);
  return legacy?.id ?? null;
}

/**
 * Списания по заказу для карточки заказа: что, сколько, на какую сумму и
 * возвращено ли уже. Возврат - приход, который ссылается на списание.
 */
export async function listWriteOffs(tx: Tx, ref: OrderRef) {
  const reversal = alias(materialsMovements, "reversal");

  // Признак «возвращено» считаем в коде по номеру прихода: колонка внутри
  // sql`` в списке выборки рендерится без имени таблицы (HANDOFF, п. 1)
  const rows = await tx
    .select({
      id: materialsMovements.id,
      quantity: materialsMovements.quantity,
      createdAt: materialsMovements.createdAt,
      name: materials.name,
      unit: materials.unit,
      amount: orderExpenses.amount,
      reversalId: reversal.id,
    })
    .from(materialsMovements)
    .innerJoin(materials, eq(materials.id, materialsMovements.materialId))
    .leftJoin(orderExpenses, eq(orderExpenses.materialMovementId, materialsMovements.id))
    .leftJoin(reversal, eq(reversal.reversesMovementId, materialsMovements.id))
    .where(
      and(
        eq(materialsMovements.referenceType, movementRefType(ref.source)),
        eq(materialsMovements.referenceId, ref.id),
        eq(materialsMovements.type, "out"),
      ),
    )
    .orderBy(desc(materialsMovements.createdAt), desc(materialsMovements.id));

  return rows.map(({ reversalId, ...r }) => ({ ...r, returned: reversalId !== null }));
}

/**
 * Материалы, которые можно списать или закупить: только действующие.
 * Отключённый материал в формах не предлагается, а сервер его и не примет.
 */
export async function activeMaterialOptions(tx: Tx) {
  return tx
    .select({
      id: materials.id,
      name: materials.name,
      unit: materials.unit,
      quantity: materialsStock.quantity,
    })
    .from(materials)
    .leftJoin(materialsStock, eq(materialsStock.materialId, materials.id))
    .where(sql`${materials.isActive} is not false`)
    .orderBy(asc(materials.name));
}
