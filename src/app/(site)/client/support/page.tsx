import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc, and, count, inArray } from "drizzle-orm";
import { ChevronRight, Link2 } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { orders, supportTickets, supportTicketMessages } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import {
  ticketStatus,
  ticketPriority,
  TICKET_CATEGORIES,
  type TicketCategory,
} from "@/lib/client-portal";
import { statusOf } from "@/lib/order-status";
import { TicketForm } from "./TicketForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Поддержка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

export default async function ClientSupportPage({
  searchParams,
}: PageProps<"/client/support">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/support");

  const userId = Number(user.id);
  const sp = await searchParams;
  const fromOrder = Number(sp.order) || 0;

  const [tickets, myOrders] = await Promise.all([
    db
      .select({
        id: supportTickets.id,
        number: supportTickets.ticketNumber,
        subject: supportTickets.subject,
        category: supportTickets.category,
        priority: supportTickets.priority,
        status: supportTickets.status,
        orderId: supportTickets.orderId,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id)),
    db
      .select({ id: orders.id, status: orders.status, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt)),
  ]);

  // Считаем сообщения отдельным запросом: коррелированный подзапрос в
  // списке выбора Drizzle печатает без имён таблиц, и условие связи
  // схлопывается в сравнение столбцов одной таблицы
  const messageCounts = tickets.length
    ? await db
        .select({ ticketId: supportTicketMessages.ticketId, n: count() })
        .from(supportTicketMessages)
        .where(
          and(
            inArray(
              supportTicketMessages.ticketId,
              tickets.map((t) => t.id),
            ),
            eq(supportTicketMessages.isInternal, false),
          ),
        )
        .groupBy(supportTicketMessages.ticketId)
    : [];

  const messagesOf = new Map(messageCounts.map((r) => [r.ticketId, Number(r.n)]));

  const orderOptions = myOrders.map((o) => ({
    id: o.id,
    label: `№ ${o.id} · ${statusOf(o.status).label}${
      o.createdAt ? ` · ${shortDate.format(o.createdAt)}` : ""
    }`,
  }));

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Поддержка"
        lead="Вопрос, претензия или уточнение по заказу. Обращение не теряется в почте: у него есть номер, статус и вся переписка в одном месте."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/support", label: "Поддержка" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-2xl text-ink">
              {tickets.length === 0 ? "Обращений нет" : `Мои обращения: ${tickets.length}`}
            </h2>
            {!fromOrder && <TicketForm orders={orderOptions} />}
          </div>

          {fromOrder > 0 && (
            <div className="mt-5">
              <TicketForm orders={orderOptions} defaultOrderId={fromOrder} startOpen />
            </div>
          )}

          {tickets.length === 0 ? (
            <p className="mt-6 rounded-card border border-dashed border-ink/20 bg-bone/60 px-6 py-10 text-center text-ink/55">
              Пока обращений нет. Если что-то пошло не так - напишите, разберёмся.
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
              {tickets.map((t) => {
                const st = ticketStatus(t.status);
                const pr = ticketPriority(t.priority);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/client/support/${t.id}`}
                      className="group flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-ink/10 bg-bone/85 px-6 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
                    >
                      <span className="font-mono text-xs text-ink/40">{t.number}</span>

                      <span className="w-full flex-1 sm:w-auto">
                        <span className="block text-ink group-hover:text-brand">
                          {t.subject}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-ink/45">
                          <span>
                            {TICKET_CATEGORIES[t.category as TicketCategory] ??
                              "Общий вопрос"}
                          </span>
                          <span>сообщений: {messagesOf.get(t.id) ?? 0}</span>
                          {t.orderId && (
                            <span className="flex items-center gap-1">
                              <Link2 className="size-3" aria-hidden />
                              заказ № {t.orderId}
                            </span>
                          )}
                          {t.updatedAt && <span>{dt.format(t.updatedAt)}</span>}
                        </span>
                      </span>

                      {t.priority !== "normal" && (
                        <span
                          className={cn(
                            "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                            pr.className,
                          )}
                        >
                          {pr.label}
                        </span>
                      )}

                      <span
                        className={cn(
                          "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                          st.className,
                        )}
                      >
                        {st.label}
                      </span>

                      <ChevronRight
                        className="size-4 text-ink/30 transition-colors group-hover:text-brand"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
