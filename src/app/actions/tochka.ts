"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tochkaInvoices } from "@/db/schema";
import { can } from "@/lib/permissions";
import {
  setCustomerCode,
  getInvoicePaymentStatus,
  sendInvoiceToEmail,
  TochkaError,
} from "@/lib/tochka";
import { tochkaStatusOf, isKnownTochkaStatus } from "@/lib/tochka-status";

export type TochkaState = { ok: boolean; message?: string };

/** Ошибка банка показывается как есть - по ней понятно, что чинить. */
function toState(e: unknown): TochkaState {
  if (e instanceof TochkaError) return { ok: false, message: e.message };
  return { ok: false, message: e instanceof Error ? e.message : "Неизвестная ошибка" };
}

export async function selectCustomer(
  _prev: TochkaState,
  formData: FormData,
): Promise<TochkaState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Нужны права на изменение настроек" };
  }

  const code = String(formData.get("customerCode") ?? "").trim();
  if (!code) return { ok: false, message: "Не выбрана компания" };

  try {
    await setCustomerCode(code);
  } catch (e) {
    return toState(e);
  }

  revalidatePath("/admin/tochka");
  return { ok: true, message: `Компания ${code} сохранена` };
}

/**
 * Сверка статусов оплаты.
 *
 * Банк не присылает уведомлений в это приложение, поэтому статус
 * приходится спрашивать самим. Проверяем только счета, которые ещё ждут
 * оплаты: по закрытым спрашивать нечего.
 */
export async function syncPaymentStatuses(
  _prev: TochkaState,
  // Форма пустая: сверяются все ожидающие счета, выбирать нечего
  _formData: FormData,
): Promise<TochkaState> {
  void _prev;
  void _formData;

  if (!(await can("finance", "view"))) {
    return { ok: false, message: "Нужны права на просмотр финансов" };
  }

  const waiting = await db
    .select({ id: tochkaInvoices.id, documentId: tochkaInvoices.documentId })
    .from(tochkaInvoices)
    .where(eq(tochkaInvoices.paymentStatus, "waiting"));

  if (waiting.length === 0) {
    return { ok: true, message: "Неоплаченных счетов нет - сверять нечего" };
  }

  let changed = 0;
  let unknown = 0;
  const failures: string[] = [];

  for (const inv of waiting) {
    try {
      const r = await getInvoicePaymentStatus(inv.documentId);
      const raw = r.Data?.paymentStatus ?? r.Data?.status ?? "";

      // Только точное совпадение со словарём: подстрока "paid" сидит и в
      // "unpaid", и неоплаченный счёт становился оплаченным
      const status = tochkaStatusOf(raw);

      // Незнакомый статус не трогаем, но пишем в журнал: если банк
      // переименует значения, сверка замолчит, и это надо заметить
      if (!isKnownTochkaStatus(raw)) {
        unknown++;
        console.warn(
          `[tochka] неизвестный статус оплаты счёта ${inv.documentId}: ${JSON.stringify(raw)}`,
        );
      }

      if (!status) continue;

      // Кривая дата от банка не должна ронять запись статуса
      const bankPaidAt = r.Data?.paidAt ? new Date(r.Data.paidAt) : null;
      const paidAt =
        bankPaidAt && !Number.isNaN(bankPaidAt.getTime()) ? bankPaidAt : new Date();
      await db
        .update(tochkaInvoices)
        .set({
          paymentStatus: status,
          paidAt: status === "paid" ? paidAt : null,
        })
        .where(eq(tochkaInvoices.id, inv.id));
      changed++;
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }

  revalidatePath("/admin/tochka");

  if (failures.length > 0 && changed === 0) {
    return { ok: false, message: `Банк не ответил: ${failures[0]}` };
  }

  const base =
    changed === 0
      ? `Проверено счетов: ${waiting.length}, изменений нет`
      : `Обновлено счетов: ${changed} из ${waiting.length}`;

  return {
    ok: true,
    message:
      unknown > 0
        ? `${base}. Статус банка не распознан у ${unknown} - подробности в журнале сервера`
        : base,
  };
}

export async function emailInvoice(
  _prev: TochkaState,
  formData: FormData,
): Promise<TochkaState> {
  if (!(await can("documents", "create"))) {
    return { ok: false, message: "Нужны права на создание документов" };
  }

  const documentId = String(formData.get("documentId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!documentId) return { ok: false, message: "Не указан счёт" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Проверьте адрес почты" };
  }

  try {
    await sendInvoiceToEmail(documentId, email);
  } catch (e) {
    return toState(e);
  }

  revalidatePath("/admin/tochka");
  return { ok: true, message: `Счёт отправлен на ${email}` };
}
