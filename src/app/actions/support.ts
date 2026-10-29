"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { supportTickets, supportTicketMessages, users } from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/client-portal";
import { notifyUser } from "@/lib/notify";
import { absoluteUrl } from "@/lib/site";
import { isKeyOf } from "@/lib/guards";
import { rejectOverlong } from "@/lib/text-limits";

export type SupportState = { ok: boolean; message?: string };

const DENIED: SupportState = { ok: false, message: "Нет прав на обращения" };

/**
 * Обращения из кабинета - та же переписка с клиентом, что и сообщения с
 * сайта, поэтому права берём у модуля messaging, своего у обращений нет.
 */
async function mayEdit() {
  return can("messaging", "edit");
}

/** Обращение вместе с автором - нужно и для ответа, и для уведомления. */
async function loadTicket(ticketId: number) {
  const [row] = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.ticketNumber,
      status: supportTickets.status,
      userId: supportTickets.userId,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  return row ?? null;
}

/**
 * Ответ клиенту или внутренняя заметка.
 *
 * Заметка видна только сотрудникам: на странице клиента такие сообщения
 * отфильтрованы, и уведомление по ним не уходит.
 */
export async function replyToTicket(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayEdit())) return DENIED;

  const ticketId = Number(formData.get("ticketId"));
  const message = String(formData.get("message") ?? "").trim();
  const isInternal = formData.get("isInternal") === "on";

  if (!Number.isInteger(ticketId)) return { ok: false, message: "Обращение не найдено" };
  if (message === "") return { ok: false, message: "Сообщение пустое" };

  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, message: "Обращение не найдено" };

  await db.transaction(async (tx) => {
    await tx.insert(supportTicketMessages).values({
      ticketId,
      userId: Number(user.id),
      message,
      isInternal,
    });

    // Первый ответ снимает обращение с «открыто»: дальше статус ведёт
    // сотрудник руками. Заметка сама по себе работой не считается
    if (!isInternal && ticket.status === "open") {
      await tx
        .update(supportTickets)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));
    } else {
      await tx
        .update(supportTickets)
        .set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));
    }
  });

  if (!isInternal) {
    await notifyUser(
      ticket.userId,
      "ticket_reply",
      `Обращение ${ticket.number}`,
      `<b>Ответ по обращению ${ticket.number}</b>\nЗайдите в кабинет - там вся переписка.`,
      [[{ text: "Открыть обращение", url: absoluteUrl(`/client/support/${ticketId}`) }]],
    );
  }

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/client/support/${ticketId}`);

  return { ok: true, message: isInternal ? "Заметка добавлена" : "Ответ отправлен" };
}

export async function setTicketStatus(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  if (!(await mayEdit())) return DENIED;

  const ticketId = Number(formData.get("ticketId"));
  const raw = String(formData.get("status") ?? "");

  if (!Number.isInteger(ticketId)) return { ok: false, message: "Обращение не найдено" };
  if (!isKeyOf(TICKET_STATUSES, raw)) return { ok: false, message: "Неизвестный статус" };

  const status = raw as TicketStatus;
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, message: "Обращение не найдено" };
  if (ticket.status === status) return { ok: true };

  // Дату закрытия ставим и для «решён», и для «закрыт»: клиенту на
  // странице обращения показывается именно она. При возврате в работу
  // дату снимаем, иначе останется след от прошлого закрытия
  const done = status === "resolved" || status === "closed";

  await db
    .update(supportTickets)
    .set({ status, resolvedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId));

  if (done) {
    await notifyUser(
      ticket.userId,
      "ticket_closed",
      `Обращение ${ticket.number}`,
      `<b>Обращение ${ticket.number}</b>\n${TICKET_STATUSES[status].label}.`,
      [[{ text: "Посмотреть", url: absoluteUrl(`/client/support/${ticketId}`) }]],
    );
  }

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/client/support/${ticketId}`);

  return { ok: true, message: `Статус: ${TICKET_STATUSES[status].label.toLowerCase()}` };
}

export async function assignTicket(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  if (!(await mayEdit())) return DENIED;

  const ticketId = Number(formData.get("ticketId"));
  const raw = String(formData.get("assignedTo") ?? "").trim();

  if (!Number.isInteger(ticketId)) return { ok: false, message: "Обращение не найдено" };

  const assignedTo = raw === "" ? null : Number(raw);

  if (assignedTo !== null) {
    if (!Number.isInteger(assignedTo)) return { ok: false, message: "Сотрудник не найден" };

    // У колонки assigned_to нет внешнего ключа - проверяем сами, иначе
    // в ней окажется id клиента или несуществующей строки
    const [staff] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assignedTo), inArray(users.role, ["admin", "manager"])))
      .limit(1);

    if (!staff) return { ok: false, message: "Сотрудник не найден" };
  }

  const updated = await db
    .update(supportTickets)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId))
    .returning({ id: supportTickets.id });

  if (updated.length === 0) return { ok: false, message: "Обращение не найдено" };

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");

  return { ok: true, message: assignedTo === null ? "Исполнитель снят" : "Назначено" };
}
