import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, asc } from "drizzle-orm";
import { ArrowLeft, Link2, CircleCheck } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { supportTickets, supportTicketMessages, users } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import {
  ticketStatus,
  ticketPriority,
  isTicketClosed,
  ticketClosedWord,
  TICKET_CATEGORIES,
  type TicketCategory,
} from "@/lib/client-portal";
import { TicketReply } from "./TicketReply";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Обращение",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ClientTicketPage({
  params,
}: PageProps<"/client/support/[id]">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/support");

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) notFound();

  const userId = Number(user.id);

  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
    .limit(1);

  if (!ticket) notFound();

  const messages = await db
    .select({
      id: supportTicketMessages.id,
      message: supportTicketMessages.message,
      createdAt: supportTicketMessages.createdAt,
      authorId: supportTicketMessages.userId,
      authorName: users.name,
      authorRole: users.role,
      isInternal: supportTicketMessages.isInternal,
    })
    .from(supportTicketMessages)
    .innerJoin(users, eq(users.id, supportTicketMessages.userId))
    .where(eq(supportTicketMessages.ticketId, ticketId))
    .orderBy(asc(supportTicketMessages.createdAt), asc(supportTicketMessages.id));

  // Внутренние заметки - переписка сотрудников между собой, клиенту их
  // видеть не полагается. Фильтруем здесь, а не в запросе, чтобы правило
  // было видно рядом с показом
  const visible = messages.filter((m) => !m.isInternal);

  const st = ticketStatus(ticket.status);
  const pr = ticketPriority(ticket.priority);
  const closed = isTicketClosed(ticket.status);

  return (
    <>
      <PageHero
        eyebrow={ticket.ticketNumber}
        title={ticket.subject}
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/support", label: "Поддержка" },
          { href: `/client/support/${ticket.id}`, label: ticket.ticketNumber },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/client/support"
                className="flex items-center gap-1.5 text-sm text-ink/55 hover:text-brand"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Все обращения
              </Link>

              <span
                className={cn(
                  "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                  st.className,
                )}
              >
                {st.label}
              </span>

              {ticket.priority !== "normal" && (
                <span
                  className={cn(
                    "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                    pr.className,
                  )}
                >
                  {pr.label}
                </span>
              )}

              <span className="text-sm text-ink/50">
                {TICKET_CATEGORIES[ticket.category as TicketCategory] ?? "Общий вопрос"}
              </span>

              {ticket.orderId && (
                <Link
                  href={`/client/orders/${ticket.orderId}`}
                  className="flex items-center gap-1 text-sm text-brand hover:text-brand-bright"
                >
                  <Link2 className="size-3.5" aria-hidden />
                  заказ № {ticket.orderId}
                </Link>
              )}
            </div>

            <ol className="mt-7 flex flex-col gap-4">
              {visible.map((m) => {
                const mine = m.authorId === userId;
                return (
                  <li
                    key={m.id}
                    className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-line rounded-card px-5 py-4 text-sm",
                        mine
                          ? "bg-brand/12 text-ink"
                          : "border border-ink/10 bg-bone/85 text-ink",
                      )}
                    >
                      {m.message}
                    </div>
                    <span className="px-1 text-xs text-ink/40">
                      {mine ? "Вы" : `${m.authorName} · БЗК`}
                      {m.createdAt && ` · ${dt.format(m.createdAt)}`}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-7">
              {closed ? (
                <div className="rounded-card border border-ink/10 bg-bone/85 px-6 py-5">
                  <p className="flex items-center gap-2.5 text-ink">
                    <CircleCheck className="size-5 text-ok" aria-hidden />
                    Обращение {ticketClosedWord(ticket.status)}
                    {ticket.resolvedAt && ` · ${dt.format(ticket.resolvedAt)}`}
                  </p>
                  <p className="mt-2 text-sm text-ink/55">
                    Переписка в нём закрыта. Если вопрос вернулся -{" "}
                    <Link
                      href="/client/support"
                      className="text-brand hover:text-brand-bright"
                    >
                      заведите новое обращение
                    </Link>
                    , так его точно не потеряют.
                  </p>
                </div>
              ) : (
                <TicketReply ticketId={ticket.id} />
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
