import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Link2, StickyNote, User } from "lucide-react";
import { db } from "@/db";
import { supportTickets, supportTicketMessages, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  ticketStatus,
  ticketPriority,
  isTicketClosed,
  ticketClosedWord,
  TICKET_CATEGORIES,
  type TicketCategory,
} from "@/lib/client-portal";
import { StatusControls, AssignControl, ReplyForm } from "./SupportControls";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Обращение · Админка",
  robots: { index: false, follow: false },
};

const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminTicket({ params }: PageProps<"/admin/support/[id]">) {
  if (!(await can("messaging", "view"))) {
    return (
      <AdminPage title="Обращение">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть переписку." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const ticketId = parseId(id);
  if (ticketId === null) notFound();

  const [ticket] = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      category: supportTickets.category,
      priority: supportTickets.priority,
      status: supportTickets.status,
      orderId: supportTickets.orderId,
      createdAt: supportTickets.createdAt,
      resolvedAt: supportTickets.resolvedAt,
      assignedTo: supportTickets.assignedTo,
      clientId: supportTickets.userId,
      clientName: users.name,
      clientEmail: users.email,
      clientPhone: users.phone,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) notFound();

  const [messages, staff] = await Promise.all([
    db
      .select({
        id: supportTicketMessages.id,
        message: supportTicketMessages.message,
        isInternal: supportTicketMessages.isInternal,
        createdAt: supportTicketMessages.createdAt,
        authorId: supportTicketMessages.userId,
        authorName: users.name,
        authorRole: users.role,
      })
      .from(supportTicketMessages)
      .leftJoin(users, eq(users.id, supportTicketMessages.userId))
      .where(eq(supportTicketMessages.ticketId, ticketId))
      .orderBy(asc(supportTicketMessages.createdAt), asc(supportTicketMessages.id)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.role, ["admin", "manager"]))
      .orderBy(asc(users.name)),
  ]);

  const canEdit = await can("messaging", "edit");
  const st = ticketStatus(ticket.status);
  const pr = ticketPriority(ticket.priority);
  const closed = isTicketClosed(ticket.status);

  return (
    <AdminPage
      title={ticket.subject}
      subtitle={`${ticket.number} · ${TICKET_CATEGORIES[ticket.category as TicketCategory] ?? "Общий вопрос"}${
        ticket.createdAt ? ` · заведено ${dtTime.format(ticket.createdAt)}` : ""
      }`}
      actions={
        <Link
          href="/admin/support"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/60 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Все обращения
        </Link>
      }
    >
      {/* --------------------------------------------------- о клиенте */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-ink/10 bg-bone px-5 py-3.5 text-sm">
        <Link
          href={`/admin/clients/${ticket.clientId}`}
          className="flex items-center gap-1.5 text-ink hover:text-brand"
        >
          <User className="size-4 text-ink/35" aria-hidden />
          {ticket.clientName ?? "клиент удалён"}
        </Link>
        {ticket.clientEmail && (
          <a href={`mailto:${ticket.clientEmail}`} className="text-ink/55 hover:text-brand">
            {ticket.clientEmail}
          </a>
        )}
        {ticket.clientPhone && (
          <a href={`tel:${ticket.clientPhone}`} className="text-ink/55 hover:text-brand">
            {ticket.clientPhone}
          </a>
        )}
        {ticket.orderId && (
          <Link
            href={`/admin/orders/${ticket.orderId}`}
            className="flex items-center gap-1.5 text-brand hover:text-brand-bright"
          >
            <Link2 className="size-3.5" aria-hidden />
            заказ № {ticket.orderId}
          </Link>
        )}
        <span
          className={cn(
            "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
            pr.className,
          )}
        >
          {pr.label.toUpperCase()}
        </span>
      </div>

      {/* ------------------------------------------------- статус и кто ведёт */}
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink/10 bg-bone px-5 py-3.5">
          <StatusControls ticketId={ticket.id} status={ticket.status} />
          <AssignControl
            ticketId={ticket.id}
            assignedTo={ticket.assignedTo}
            staff={staff}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink/55">
          Статус: {st.label.toLowerCase()}
        </p>
      )}

      {/* ------------------------------------------------------ переписка */}
      <ol className="mt-6 flex max-w-3xl flex-col gap-4">
        {messages.map((m) => {
          const fromClient = m.authorId === ticket.clientId;

          if (m.isInternal) {
            return (
              <li key={m.id} className="flex flex-col gap-1">
                <div className="whitespace-pre-line rounded-xl border border-warn/30 bg-warn/8 px-5 py-4 text-sm text-ink">
                  {m.message}
                </div>
                <span className="flex items-center gap-1.5 px-1 text-xs text-ink/40">
                  <StickyNote className="size-3" aria-hidden />
                  заметка для своих · {m.authorName ?? "сотрудник"}
                  {m.createdAt && ` · ${dtTime.format(m.createdAt)}`}
                </span>
              </li>
            );
          }

          return (
            <li
              key={m.id}
              className={cn(
                "flex flex-col gap-1",
                fromClient ? "items-start" : "items-end",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-xl px-5 py-4 text-sm text-ink",
                  fromClient ? "border border-ink/10 bg-bone" : "bg-brand/12",
                )}
              >
                {m.message}
              </div>
              <span className="px-1 text-xs text-ink/40">
                {fromClient
                  ? (m.authorName ?? "клиент")
                  : `${m.authorName ?? "сотрудник"} · мы`}
                {m.createdAt && ` · ${dtTime.format(m.createdAt)}`}
              </span>
            </li>
          );
        })}
      </ol>

      {/* --------------------------------------------------------- ответ */}
      <div className="mt-6 max-w-3xl">
        {!canEdit ? null : closed ? (
          <p className="rounded-xl border border-ink/10 bg-bone px-5 py-4 text-sm text-ink/55">
            Обращение {ticketClosedWord(ticket.status)}
            {ticket.resolvedAt && ` · ${dtTime.format(ticket.resolvedAt)}`}. Клиент писать
            в него больше не может - чтобы ответить, верните статус «в работе».
          </p>
        ) : (
          <ReplyForm ticketId={ticket.id} />
        )}
      </div>
    </AdminPage>
  );
}
