"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  expensesCategories,
  generalExpenses,
  orderExpenses,
  orderPayments,
  ordersAccounting,
} from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { addOrderPayment, recalcCard, type MoneySummary } from "@/lib/order-money-db";

export type FinanceState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const DENIED: FinanceState = { error: "Нет прав менять бухгалтерию" };

/** Сумма из формы: «1 200,50» и «1200.5» - одно и то же число. */
function parseMoney(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (text === "") return NaN;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** Дата из формы. Пусто - сегодня: чаще всего вносят день в день. */
function parseDate(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date();
  // Полдень по местному, иначе календарный день съезжает при пересчёте
  // часового пояса
  return new Date(`${text}T12:00:00`);
}

async function categoryOrNull(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const id = Number(text);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db
    .select({ id: expensesCategories.id })
    .from(expensesCategories)
    .where(eq(expensesCategories.id, id))
    .limit(1);
  return row ? id : null;
}

/**
 * Сбросить кеш страниц, где видны деньги карточки: сама карточка,
 * бухгалтерия, аналитика и заказ, к которому она привязана.
 */
function revalidateMoney(cardId: number, summary: MoneySummary | null) {
  revalidatePath(`/admin/finance/${cardId}`);
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin");
  const ref = summary?.ref;
  if (ref?.source === "external") {
    revalidatePath(`/admin/external-orders/${ref.id}`);
    revalidatePath("/admin/external-orders");
    revalidatePath(`/client/orders/external/${ref.id}`);
  } else if (ref?.source === "site") {
    revalidatePath(`/admin/orders/${ref.id}`);
    revalidatePath(`/client/orders/${ref.id}`);
  }
  revalidatePath("/client/orders");
}

/** Расход по заказу: материал, работа подрядчика, доставка. */
export async function addExpense(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "create"))) return DENIED;

  const cardId = Number(formData.get("cardId"));
  if (!Number.isInteger(cardId) || cardId <= 0) return { error: "Запись не найдена" };

  const amount = parseMoney(formData.get("amount"));
  if (Number.isNaN(amount)) {
    return { fieldErrors: { amount: "Сумма вида 1234.56, больше нуля" } };
  }

  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  if (description === "") {
    return { fieldErrors: { description: "Напишите, за что расход" } };
  }

  const [card] = await db
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.id, cardId))
    .limit(1);
  if (!card) return { error: "Запись не найдена" };

  const categoryId = await categoryOrNull(formData.get("categoryId"));

  // Строка и пересчёт - одной транзакцией: иначе между ними итог карточки
  // уже не совпадает со строками
  const summary = await db.transaction(async (tx) => {
    await tx.insert(orderExpenses).values({
      orderAccountingId: cardId,
      amount: amount.toFixed(2),
      description,
      categoryId,
      expenseDate: parseDate(formData.get("expenseDate")),
    });
    return recalcCard(tx, cardId);
  });

  await audit("finance.expense_add", { type: "orders_accounting", id: cardId }, {
    amount: amount.toFixed(2),
  });

  revalidateMoney(cardId, summary);
  return { ok: true, message: "Расход записан" };
}

export async function deleteExpense(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "delete"))) {
    return { error: "Удалять расходы может только администратор" };
  }

  const cardId = Number(formData.get("cardId"));
  const expenseId = Number(formData.get("expenseId"));
  if (!Number.isInteger(cardId) || !Number.isInteger(expenseId)) {
    return { error: "Расход не найден" };
  }

  const result = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(orderExpenses)
      .where(
        and(
          eq(orderExpenses.id, expenseId),
          // Номер приходит из формы: без привязки к карточке можно было бы
          // удалить чужую строку
          eq(orderExpenses.orderAccountingId, cardId),
        ),
      )
      .returning({ id: orderExpenses.id, amount: orderExpenses.amount });
    if (removed.length === 0) return null;
    return { amount: removed[0].amount, summary: await recalcCard(tx, cardId) };
  });

  if (!result) return { error: "Расход не найден" };

  await audit("finance.expense_delete", { type: "orders_accounting", id: cardId }, {
    expenseId,
    amount: result.amount,
  });

  revalidateMoney(cardId, result.summary);
  return { ok: true, message: "Расход удалён" };
}

/**
 * Платёж по заказу.
 *
 * Статус оплаты после этого считается заново: раньше его ставили руками
 * в карточке заказа, и он расходился с платежами.
 */
export async function addPayment(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "create"))) return DENIED;

  const cardId = Number(formData.get("cardId"));
  if (!Number.isInteger(cardId) || cardId <= 0) return { error: "Запись не найдена" };

  const amount = parseMoney(formData.get("amount"));
  if (Number.isNaN(amount)) {
    return { fieldErrors: { amount: "Сумма вида 1234.56, больше нуля" } };
  }

  const [card] = await db
    .select({ id: ordersAccounting.id })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.id, cardId))
    .limit(1);
  if (!card) return { error: "Запись не найдена" };

  const paidAt = parseDate(formData.get("paymentDate"));

  const { summary } = await db.transaction((tx) =>
    addOrderPayment(tx, cardId, {
      amount,
      paidAt,
      note: String(formData.get("note") ?? "").trim().slice(0, 1000) || null,
    }),
  );

  await audit("finance.payment_add", { type: "orders_accounting", id: cardId }, {
    amount: amount.toFixed(2),
    status: summary?.status ?? null,
  });

  revalidateMoney(cardId, summary);
  return { ok: true, message: "Платёж записан" };
}

export async function deletePayment(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "delete"))) {
    return { error: "Удалять платежи может только администратор" };
  }

  const cardId = Number(formData.get("cardId"));
  const paymentId = Number(formData.get("paymentId"));
  if (!Number.isInteger(cardId) || !Number.isInteger(paymentId)) {
    return { error: "Платёж не найден" };
  }

  const result = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(orderPayments)
      .where(
        and(
          eq(orderPayments.id, paymentId),
          eq(orderPayments.orderAccountingId, cardId),
        ),
      )
      .returning({ id: orderPayments.id, amount: orderPayments.amount });
    if (removed.length === 0) return null;
    return { amount: removed[0].amount, summary: await recalcCard(tx, cardId) };
  });

  if (!result) return { error: "Платёж не найден" };

  await audit("finance.payment_delete", { type: "orders_accounting", id: cardId }, {
    paymentId,
    amount: result.amount,
    status: result.summary?.status ?? null,
  });

  revalidateMoney(cardId, result.summary);
  return { ok: true, message: "Платёж удалён" };
}

/**
 * Общий расход - тот, что не отнести на заказ: аренда, связь, реклама.
 *
 * В прибыли периода он вычитается отдельно, потому что в карточках
 * заказов его нет.
 */
export async function addGeneralExpense(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "create"))) return DENIED;

  const amount = parseMoney(formData.get("amount"));
  if (Number.isNaN(amount)) {
    return { fieldErrors: { amount: "Сумма вида 1234.56, больше нуля" } };
  }

  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  if (description === "") {
    return { fieldErrors: { description: "Напишите, за что расход" } };
  }

  const [created] = await db
    .insert(generalExpenses)
    .values({
      amount: amount.toFixed(2),
      description,
      categoryId: await categoryOrNull(formData.get("categoryId")),
      expenseDate: parseDate(formData.get("expenseDate")),
    })
    .returning({ id: generalExpenses.id });

  await audit("finance.general_expense_add", { type: "general_expense", id: created.id }, {
    amount: amount.toFixed(2),
  });

  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
  return { ok: true, message: "Расход записан" };
}

export async function deleteGeneralExpense(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await can("finance", "delete"))) {
    return { error: "Удалять расходы может только администратор" };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Расход не найден" };

  const removed = await db
    .delete(generalExpenses)
    .where(eq(generalExpenses.id, id))
    .returning({ id: generalExpenses.id });
  if (removed.length === 0) return { error: "Расход не найден" };

  await audit("finance.general_expense_delete", { type: "general_expense", id });
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
  return { ok: true, message: "Расход удалён" };
}
