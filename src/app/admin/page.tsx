import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import {
  orders,
  users,
  externalOrders,
  tasks,
  supportTickets,
  contactMessages,
} from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { statusOf } from "@/lib/order-status";
import {
  externalPaymentStatus,
  externalProductionStatus,
  isExternalLate,
} from "@/lib/external-orders";
import { isOverdue } from "@/lib/tasks";
import { cn } from "@/lib/cn";
import { openDebt } from "@/lib/order-money-db";

export const metadata: Metadata = {
  title: "Сводка · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const dt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });
const today = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

/** Статусы заказа с сайта, при которых он ещё в работе. */
const SITE_OPEN = ["pending", "processing", "in_work", "ready", "delayed", "shipped"] as const;

/** Закрытые заказы менеджера - те же, что считает isExternalClosed. */
const EXTERNAL_CLOSED = ["completed", "cancelled"] as const;

/**
 * Сводка «на сегодня».
 *
 * Раньше здесь были общие цифры по заказам с сайта - а их единицы, тогда
 * как вся работа идёт в заказах менеджера. Теперь сводка отвечает на
 * вопрос, с которого начинается день: что горит, что сдавать сегодня и
 * завтра, кто не заплатил, какие задачи и сообщения ждут.
 *
 * Разделы показываются по правам роли: менеджер без бухгалтерии не
 * увидит денег, которые ему смотреть не положено.
 */
export default async function AdminDashboard() {
  const [canOrders, canTasks, canMessaging, canFinance] = await Promise.all([
    can("orders", "view"),
    can("tasks", "view"),
    can("messaging", "view"),
    can("finance", "view"),
  ]);

  const [openExternal, unpaid, siteStats, recentExternal, recentSite, openTasks, inbox, tickets] =
    await Promise.all([
      // Открытых заказов немного, и срок удобнее разбирать в коде тем же
      // правилом, что в списке заказов, чем повторять его в SQL
      canOrders
        ? db
            .select({
              id: externalOrders.id,
              clientName: externalOrders.clientName,
              description: externalOrders.description,
              totalPrice: externalOrders.totalPrice,
              status: externalOrders.status,
              productionStatus: externalOrders.productionStatus,
              readyDate: externalOrders.estimatedReadyDate,
            })
            .from(externalOrders)
            .where(notInArray(externalOrders.productionStatus, [...EXTERNAL_CLOSED]))
        : Promise.resolve([]),
      // Долг - доход минус платежи по каждой карточке, по заказам обоих
      // видов и без отменённых. Раньше здесь была полная сумма неоплаченных
      // заказов менеджера: частичная оплата долг не уменьшала
      // Без права на бухгалтерию денег не показываем: только число
      // неоплаченных заказов менеджера (не отменённых) - ровно то, что
      // откроет ссылка на список с фильтром «Не оплачен»
      canOrders
        ? canFinance
          ? openDebt()
          : db
              .select({ n: count() })
              .from(externalOrders)
              .where(
                and(
                  eq(externalOrders.status, "unpaid"),
                  sql`${externalOrders.productionStatus} <> 'cancelled'`,
                ),
              )
              .then(([r]) => ({ n: Number(r?.n ?? 0), debt: 0, paid: 0 }))
        : Promise.resolve(null),
      canOrders
        ? db
            .select({
              open: sql<number>`count(*) filter (where ${inArray(orders.status, [...SITE_OPEN])})::int`,
              fresh: sql<number>`count(*) filter (where ${eq(orders.isNew, true)})::int`,
            })
            .from(orders)
        : Promise.resolve([]),
      canOrders
        ? db
            .select({
              id: externalOrders.id,
              clientName: externalOrders.clientName,
              totalPrice: externalOrders.totalPrice,
              productionStatus: externalOrders.productionStatus,
              createdAt: externalOrders.createdAt,
            })
            .from(externalOrders)
            .orderBy(desc(externalOrders.createdAt), desc(externalOrders.id))
            .limit(6)
        : Promise.resolve([]),
      canOrders
        ? db
            .select({
              id: orders.id,
              status: orders.status,
              total: orders.totalPrice,
              createdAt: orders.createdAt,
              isNew: orders.isNew,
              clientName: users.name,
            })
            .from(orders)
            .leftJoin(users, eq(orders.userId, users.id))
            .orderBy(desc(orders.createdAt))
            .limit(6)
        : Promise.resolve([]),
      canTasks
        ? db
            .select({
              id: tasks.id,
              title: tasks.title,
              status: tasks.status,
              dueDate: tasks.dueDate,
              assigneeName: users.name,
            })
            .from(tasks)
            .leftJoin(users, eq(users.id, tasks.assignedTo))
            .where(
              and(inArray(tasks.status, ["pending", "in_progress"]), isNotNull(tasks.dueDate)),
            )
        : Promise.resolve([]),
      canMessaging
        ? db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, "new"))
        : Promise.resolve([]),
      canMessaging
        ? db
            .select({ n: count() })
            .from(supportTickets)
            .where(inArray(supportTickets.status, ["open", "in_progress"]))
        : Promise.resolve([]),
    ]);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const afterTomorrow = new Date(startOfToday);
  afterTomorrow.setDate(afterTomorrow.getDate() + 2);

  const late = openExternal.filter((o) => isExternalLate(o.readyDate, o.productionStatus, now));
  const soon = openExternal.filter(
    (o) =>
      o.readyDate !== null &&
      !isExternalLate(o.readyDate, o.productionStatus, now) &&
      o.readyDate.getTime() < afterTomorrow.getTime(),
  );
  // Горящие: сперва просроченные, внутри - по сроку
  const burning = [...late, ...soon].sort(
    (a, b) => (a.readyDate?.getTime() ?? 0) - (b.readyDate?.getTime() ?? 0),
  );

  const lateTasks = openTasks.filter((t) => isOverdue(t.dueDate, t.status, now));
  const todayTasks = openTasks.filter(
    (t) =>
      t.dueDate !== null &&
      !isOverdue(t.dueDate, t.status, now) &&
      t.dueDate.getTime() < afterTomorrow.getTime() - 24 * 3600 * 1000,
  );

  const unpaidRow = unpaid;
  const site = siteStats[0];

  return (
    <AdminPage title="Сводка" subtitle={`Что требует внимания - ${today.format(now)}`}>
      {canOrders && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatLink href="/admin/external-orders" enabled>
            <AdminStat
              label="Просрочены"
              value={String(late.length)}
              hint={late.length > 0 ? "срок готовности прошёл" : "всё в срок"}
              tone={late.length > 0 ? "warn" : "plain"}
            />
          </StatLink>
          <StatLink href="/admin/production" enabled>
            <AdminStat
              label="Сдавать сегодня и завтра"
              value={String(soon.length)}
              hint={`в работе всего: ${openExternal.length}`}
              tone={soon.length > 0 ? "brand" : "plain"}
            />
          </StatLink>
          <StatLink href={canFinance ? "/admin/finance" : "/admin/external-orders?status=unpaid"} enabled>
            <AdminStat
              label="Ждут оплаты"
              value={String(unpaidRow?.n ?? 0)}
              hint={
                canFinance
                  ? `долг ${money.format(unpaidRow?.debt ?? 0)} - сайт и менеджер`
                  : "заказов менеджера без оплаты"
              }
            />
          </StatLink>
          <StatLink href="/admin/orders" enabled>
            <AdminStat
              label="Заказы с сайта"
              value={String(site?.fresh ?? 0)}
              hint={`новых · в работе: ${site?.open ?? 0}`}
              tone={(site?.fresh ?? 0) > 0 ? "brand" : "plain"}
            />
          </StatLink>
        </div>
      )}

      {(canTasks || canMessaging) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canTasks && (
            <>
              <StatLink href="/admin/tasks" enabled>
                <AdminStat
                  label="Задачи просрочены"
                  value={String(lateTasks.length)}
                  tone={lateTasks.length > 0 ? "warn" : "plain"}
                />
              </StatLink>
              <StatLink href="/admin/tasks" enabled>
                <AdminStat label="Задачи на сегодня" value={String(todayTasks.length)} />
              </StatLink>
            </>
          )}
          {canMessaging && (
            <>
              <StatLink href="/admin/inbox" enabled>
                <AdminStat
                  label="Новые сообщения с сайта"
                  value={String(inbox[0]?.n ?? 0)}
                  tone={(inbox[0]?.n ?? 0) > 0 ? "brand" : "plain"}
                />
              </StatLink>
              <StatLink href="/admin/support" enabled>
                <AdminStat label="Открытые обращения" value={String(tickets[0]?.n ?? 0)} />
              </StatLink>
            </>
          )}
        </div>
      )}

      {canOrders && (
        <section className="mt-8">
          <SectionHead title="Горящие заказы" href="/admin/external-orders" link="Все заказы" />
          {burning.length === 0 ? (
            <AdminEmpty
              title="Ничего не горит"
              text="Просроченных заказов нет, и на сегодня-завтра сдавать нечего."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>№</Th>
                    <Th>Клиент</Th>
                    <Th>Срок</Th>
                    <Th>Стадия</Th>
                    <Th>Оплата</Th>
                    <Th className="text-right">Сумма</Th>
                  </tr>
                </thead>
                <tbody>
                  {burning.map((o) => {
                    const isLate = isExternalLate(o.readyDate, o.productionStatus, now);
                    const prod = externalProductionStatus(o.productionStatus);
                    const pay = externalPaymentStatus(o.status);
                    return (
                      <tr key={o.id} className="border-b border-ink/6 last:border-0 hover:bg-paper">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/external-orders/${o.id}`}
                            className="flex items-center gap-1 font-mono text-ink hover:text-brand"
                          >
                            {o.id}
                            <ChevronRight className="size-3 text-ink/25" aria-hidden />
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-ink">{o.clientName}</span>
                          {o.description && (
                            <span className="block max-w-72 truncate text-xs text-ink/45">
                              {o.description}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                          <span className={isLate ? "font-semibold text-danger" : "text-ink/70"}>
                            {o.readyDate ? dt.format(o.readyDate) : "-"}
                          </span>
                          {isLate && (
                            <span className="ml-1.5 rounded bg-danger/12 px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider text-danger">
                              ПРОСРОЧЕН
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge className={prod.className}>{prod.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge className={pay.className}>{pay.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                          {money.format(Number(o.totalPrice))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canTasks && lateTasks.length + todayTasks.length > 0 && (
        <section className="mt-8">
          <SectionHead title="Задачи: просроченные и на сегодня" href="/admin/tasks" link="Все задачи" />
          <ul className="divide-y divide-ink/6 overflow-hidden rounded-xl border border-ink/10 bg-bone">
            {[...lateTasks, ...todayTasks].map((t) => {
              const isLate = isOverdue(t.dueDate, t.status, now);
              return (
                <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span className="text-sm text-ink">{t.title}</span>
                  <span className="flex items-center gap-3 font-mono text-xs text-ink/50">
                    {t.assigneeName ?? "не назначена"}
                    <span className={cn(isLate && "font-semibold text-danger")}>
                      {isLate ? "срок был " : "до "}
                      {t.dueDate ? dt.format(t.dueDate) : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {canOrders && (
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <section>
            <SectionHead title="Новые заказы менеджера" href="/admin/external-orders" link="Все" />
            {recentExternal.length === 0 ? (
              <AdminEmpty title="Заказов пока нет" />
            ) : (
              <ul className="divide-y divide-ink/6 overflow-hidden rounded-xl border border-ink/10 bg-bone">
                {recentExternal.map((o) => {
                  const prod = externalProductionStatus(o.productionStatus);
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/admin/external-orders/${o.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-ink/45">№ {o.id} · </span>
                          <span className="text-sm text-ink">{o.clientName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <Badge className={prod.className}>{prod.label}</Badge>
                          <span className="font-mono text-sm tabular-nums text-ink">
                            {money.format(Number(o.totalPrice))}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <SectionHead title="Заказы с сайта" href="/admin/orders" link="Все" />
            {recentSite.length === 0 ? (
              <AdminEmpty
                title="Заказов пока нет"
                text="Как только клиент оформит заказ на сайте, он появится здесь."
              />
            ) : (
              <ul className="divide-y divide-ink/6 overflow-hidden rounded-xl border border-ink/10 bg-bone">
                {recentSite.map((o) => {
                  const st = statusOf(o.status);
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-ink/45">№ {o.id} · </span>
                          <span className="text-sm text-ink">{o.clientName ?? "-"}</span>
                          {o.isNew && (
                            <span className="ml-2 rounded bg-brand/12 px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider text-brand">
                              НОВЫЙ
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <Badge className={st.className}>{st.label}</Badge>
                          <span className="font-mono text-sm tabular-nums text-ink">
                            {money.format(Number(o.total))}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {!canOrders && !canTasks && !canMessaging && (
        <AdminEmpty
          title="Разделов для сводки нет"
          text="У вашей роли нет прав на заказы, задачи и сообщения - откройте нужный раздел в меню."
        />
      )}
    </AdminPage>
  );
}

/** Плитка-ссылка: цифра в сводке сразу ведёт туда, где с ней работают. */
function StatLink({
  href,
  enabled,
  children,
}: {
  href: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Link
      href={href}
      className="block rounded-xl transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-bright"
    >
      {children}
    </Link>
  );
}

function SectionHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <Link href={href} className="text-sm text-brand hover:text-brand-bright">
        {link} →
      </Link>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 font-display text-[0.62rem] font-semibold tracking-[0.16em] text-ink/40",
        className,
      )}
    >
      {children}
    </th>
  );
}
