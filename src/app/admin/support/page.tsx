import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray, count, notInArray } from "drizzle-orm";
import { Link2, User } from "lucide-react";
import { db } from "@/db";
import { supportTickets, supportTicketMessages, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import {
  ticketStatus,
  ticketPriority,
  isTicketClosed,
  TICKET_STATUSES,
  TICKET_CATEGORIES,
  type TicketStatus,
  type TicketCategory,
} from "@/lib/client-portal";
import { cn } from "@/lib/cn";
import { isKeyOf } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Поддержка · Админка",
  robots: { index: false, follow: false },
};

const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const PER_PAGE = 50;

export default async function AdminSupport({ searchParams }: PageProps<"/admin/support">) {
  if (!(await can("messaging", "view"))) {
    return (
      <AdminPage title="Поддержка">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть переписку." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const rawStatus = String(sp.status ?? "");
  const status = isKeyOf(TICKET_STATUSES, rawStatus) ? (rawStatus as TicketStatus) : null;

  // По умолчанию - незакрытые: решённые копятся и вытесняют живые
  const openOnly = !status && sp.all !== "1";

  const page = pageFrom(sp.page);
  const where = status
    ? eq(supportTickets.status, status)
    : openOnly
      ? notInArray(supportTickets.status, ["resolved", "closed"])
      : undefined;

  const rows = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      category: supportTickets.category,
      priority: supportTickets.priority,
      status: supportTickets.status,
      orderId: supportTickets.orderId,
      updatedAt: supportTickets.updatedAt,
      clientId: supportTickets.userId,
      clientName: users.name,
      assignedTo: supportTickets.assignedTo,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(where)
    .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
    .limit(PER_PAGE)
    .offset(offsetOf(page, PER_PAGE));

  const [{ n: found }] = await db.select({ n: count() }).from(supportTickets).where(where);

  const [byStatus, staff, messages] = await Promise.all([
    db
      .select({ status: supportTickets.status, n: count() })
      .from(supportTickets)
      .groupBy(supportTickets.status),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.role, ["admin", "manager"]))
      .orderBy(asc(users.name)),
    // Кто написал последним - по этому видно, за кем очередь. Тянем
    // отдельным запросом: коррелированный подзапрос в списке выборки
    // Drizzle отдаёт без имени таблицы, и колонка сравнивается сама с собой
    rows.length
      ? db
          .select({
            ticketId: supportTicketMessages.ticketId,
            authorId: supportTicketMessages.userId,
            isInternal: supportTicketMessages.isInternal,
          })
          .from(supportTicketMessages)
          .where(
            inArray(
              supportTicketMessages.ticketId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(supportTicketMessages.createdAt), asc(supportTicketMessages.id))
      : [],
  ]);

  const staffName = new Map(staff.map((s) => [s.id, s.name]));

  // Идём по возрастанию времени, поэтому в карте остаётся самое свежее
  const lastOf = new Map<number, (typeof messages)[number]>();
  const countOf = new Map<number, number>();
  for (const m of messages) {
    if (!m.isInternal) lastOf.set(m.ticketId, m);
    countOf.set(m.ticketId, (countOf.get(m.ticketId) ?? 0) + 1);
  }

  const statusCount = new Map(byStatus.map((r) => [r.status, Number(r.n)]));
  const total = byStatus.reduce((s, r) => s + Number(r.n), 0);
  const live = total - (statusCount.get("resolved") ?? 0) - (statusCount.get("closed") ?? 0);

  // Очередь за нами, если последним писал клиент
  const waitingUs = rows.filter(
    (r) => !isTicketClosed(r.status) && lastOf.get(r.id)?.authorId === r.clientId,
  ).length;

  return (
    <AdminPage
      title="Поддержка"
      subtitle={
        openOnly ? "Показаны незакрытые" : status ? TICKET_STATUSES[status].label : "Все"
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Всего обращений" value={String(total)} />
        <AdminStat
          label="Незакрытых"
          value={String(live)}
          tone={live > 0 ? "brand" : "plain"}
        />
        <AdminStat
          label="Ждут ответа"
          value={String(waitingUs)}
          tone={waitingUs > 0 ? "warn" : "plain"}
          hint="последним писал клиент"
        />
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        <Chip href="/admin/support" active={openOnly}>
          Незакрытые · {live}
        </Chip>
        {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map((key) => (
          <Chip key={key} href={`/admin/support?status=${key}`} active={status === key}>
            {TICKET_STATUSES[key].label} · {statusCount.get(key) ?? 0}
          </Chip>
        ))}
        <Chip href="/admin/support?all=1" active={!openOnly && !status}>
          Все · {total}
        </Chip>
      </nav>

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title="Обращений нет"
            text={
              total === 0
                ? "Клиенты заводят их в кабинете, в разделе «Поддержка»."
                : "В этой выборке пусто."
            }
          />
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {rows.map((t) => {
            const st = ticketStatus(t.status);
            const pr = ticketPriority(t.priority);
            const last = lastOf.get(t.id);
            const answered = last ? last.authorId !== t.clientId : false;

            return (
              <li
                key={t.id}
                className="rounded-xl border border-ink/10 bg-bone px-5 py-3.5 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/support/${t.id}`}
                      className="font-display text-base text-ink hover:text-brand"
                    >
                      {t.subject}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink/45">
                      <span className="font-mono">{t.number}</span> ·{" "}
                      {TICKET_CATEGORIES[t.category as TicketCategory] ?? "Общий вопрос"} ·{" "}
                      {countOf.get(t.id) ?? 0} сообщ.
                      {t.updatedAt && ` · ${dtTime.format(t.updatedAt)}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {t.priority !== "normal" && (
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          pr.className,
                        )}
                      >
                        {pr.label.toUpperCase()}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/50">
                  <Link
                    href={`/admin/clients/${t.clientId}`}
                    className="flex items-center gap-1.5 hover:text-brand"
                  >
                    <User className="size-3.5" aria-hidden />
                    {t.clientName ?? "клиент удалён"}
                  </Link>
                  {t.orderId && (
                    <Link
                      href={`/admin/orders/${t.orderId}`}
                      className="flex items-center gap-1.5 hover:text-brand"
                    >
                      <Link2 className="size-3.5" aria-hidden />
                      заказ № {t.orderId}
                    </Link>
                  )}
                  <span>
                    {t.assignedTo
                      ? `Ведёт: ${staffName.get(t.assignedTo) ?? "бывший сотрудник"}`
                      : "Без исполнителя"}
                  </span>
                  {!isTicketClosed(t.status) && last && (
                    <span className={answered ? "text-ink/50" : "text-warn"}>
                      {answered ? "ответ отправлен" : "ждёт ответа"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPager page={page} perPage={PER_PAGE} total={Number(found)} basePath="/admin/support" params={sp} />
    </AdminPage>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3.5 py-1.5 text-xs",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-ink/12 text-ink/60 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
