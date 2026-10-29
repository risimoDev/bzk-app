import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalOrderItems, externalOrders, products, suppliers } from "@/db/schema";
import {
  canChangeContractorStatus,
  contractorStatusOf,
  contractorTaskNumber,
  type ContractorStatus,
} from "@/lib/contractor-task";
import type { Tx } from "@/lib/order-money-db";

export class ContractorTaskError extends Error {}

export type ContractorTask = {
  number: string;
  supplier: { name: string; contactPerson: string | null };
  /** Есть позиции, о которых подрядчику ещё не сообщили. */
  hasUnsent: boolean;
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    /** Срок сдачи нам; null - не назначен. */
    dueDate: Date | null;
  }[];
};

/**
 * Данные для листа «Задание подрядчику».
 *
 * Выбираются поимённо и только то, что подрядчику можно знать: название,
 * описание, количество, единица, срок. Заказчика (имя, телефон, почта,
 * адрес, комментарии) и денег (цена, сумма, себестоимость, корректировка)
 * здесь нет ни в запросе, ни в ответе - `check:contractor-task` ищет такие
 * обращения в исходнике и проверяет ответ на настоящих данных. Заказ
 * читается ради одного: существует ли он.
 */
export async function loadContractorTask(
  orderId: number,
  supplierId: number,
): Promise<ContractorTask | null> {
  const [order] = await db
    .select({ id: externalOrders.id })
    .from(externalOrders)
    .where(eq(externalOrders.id, orderId))
    .limit(1);
  if (!order) return null;

  const [supplier] = await db
    .select({ name: suppliers.name, contactPerson: suppliers.contactPerson })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) return null;

  const rows = await db
    .select({
      itemName: externalOrderItems.itemName,
      productName: products.name,
      description: externalOrderItems.itemDescription,
      quantity: externalOrderItems.quantity,
      unit: products.unit,
      dueDate: externalOrderItems.contractorDueDate,
      status: externalOrderItems.contractorStatus,
    })
    .from(externalOrderItems)
    .leftJoin(products, eq(products.id, externalOrderItems.productId))
    .where(
      and(
        eq(externalOrderItems.externalOrderId, orderId),
        eq(externalOrderItems.supplierId, supplierId),
        eq(externalOrderItems.isOutsourced, true),
      ),
    )
    .orderBy(asc(externalOrderItems.id));

  if (rows.length === 0) return null;

  return {
    number: contractorTaskNumber(orderId, supplierId),
    supplier,
    hasUnsent: rows.some((r) => r.status === "not_sent"),
    items: rows.map((r) => ({
      name: r.productName ?? r.itemName ?? "Без названия",
      description: r.description,
      quantity: r.quantity,
      unit: r.unit || "шт.",
      dueDate: r.dueDate,
    })),
  };
}

/**
 * Смена статуса работы подрядчика на позиции. Строку блокируем: два
 * менеджера, нажавшие одновременно, не должны оба «перейти» из одного
 * и того же статуса.
 */
export async function changeContractorStatus(
  tx: Tx,
  input: { orderId: number; itemId: number; to: ContractorStatus },
) {
  const [item] = await tx
    .select({
      status: externalOrderItems.contractorStatus,
      isOutsourced: externalOrderItems.isOutsourced,
      supplierId: externalOrderItems.supplierId,
    })
    .from(externalOrderItems)
    .where(
      and(
        eq(externalOrderItems.id, input.itemId),
        // Номер позиции приходит из формы: без заказа можно было бы
        // сменить статус чужой строки
        eq(externalOrderItems.externalOrderId, input.orderId),
      ),
    )
    .limit(1)
    .for("no key update");

  if (!item) throw new ContractorTaskError("Позиция не найдена");
  if (!item.isOutsourced || item.supplierId === null) {
    throw new ContractorTaskError("Позиция не перезаказана у подрядчика");
  }

  const from = contractorStatusOf(item.status);
  if (from === input.to) return { changed: false as const, from };
  if (!canChangeContractorStatus(from, input.to)) {
    throw new ContractorTaskError("Так статус подрядчика не меняется: вперёд - на любой, назад - на шаг");
  }

  await tx
    .update(externalOrderItems)
    .set({ contractorStatus: input.to, contractorStatusAt: new Date() })
    .where(eq(externalOrderItems.id, input.itemId));

  return { changed: true as const, from };
}

/**
 * Задание отправлено: все ещё не отправленные позиции подрядчика в заказе
 * становятся «отправлено». Те, что уже дальше, не трогаем.
 */
export async function markTaskSent(tx: Tx, input: { orderId: number; supplierId: number }) {
  const rows = await tx
    .update(externalOrderItems)
    .set({ contractorStatus: "sent", contractorStatusAt: new Date() })
    .where(
      and(
        eq(externalOrderItems.externalOrderId, input.orderId),
        eq(externalOrderItems.supplierId, input.supplierId),
        eq(externalOrderItems.isOutsourced, true),
        eq(externalOrderItems.contractorStatus, "not_sent"),
      ),
    )
    .returning({ id: externalOrderItems.id });
  return rows.map((r) => r.id);
}
