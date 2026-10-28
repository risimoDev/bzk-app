import type { Metadata } from "next";
import Link from "next/link";
import { eq, asc, desc, inArray, sql } from "drizzle-orm";
import { Flame, ClipboardCheck } from "lucide-react";
import { db } from "@/db";
import {
  productionOrders,
  productionOrderStages,
  productionStages,
  externalOrders,
  orders,
  users,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { productionStatusOf, priorityOf } from "@/lib/production";
import { StageControls, StartProductionForm } from "./ProductionForms";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Производство · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});

/** Заказы, которые уже можно запускать в цех. */
const READY_TO_START = ["pending", "processing"] as const;

export default async function AdminProduction() {
  if (!(await can("kanban", "view"))) {
    return (
      <AdminPage title="Производство">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть доску." />
      </AdminPage>
    );
  }

  const editable = await can("kanban", "edit");

  const [stages, active, waitingSite, waitingExternal] = await Promise.all([
    db
      .select()
      .from(productionStages)
      .where(eq(productionStages.isActive, true))
      .orderBy(asc(productionStages.sortOrder), asc(productionStages.id)),

    // Всё, что в цехе: и в работе, и приостановленное. Заказы обоих
    // типов лежат в одной таблице, поэтому подтягиваем и тех и других
    db
      .select({
        id: productionOrders.id,
        status: productionOrders.status,
        priority: productionOrders.priority,
        currentStageId: productionOrders.currentStageId,
        deadline: productionOrders.deadline,
        startedAt: productionOrders.startedAt,
        orderId: productionOrders.orderId,
        externalOrderId: productionOrders.externalOrderId,
        orderTotal: orders.totalPrice,
        orderUrgent: orders.isUrgent,
        externalTotal: externalOrders.totalPrice,
        siteClient: users.name,
        externalClient: externalOrders.clientName,
      })
      .from(productionOrders)
      .leftJoin(orders, eq(productionOrders.orderId, orders.id))
      .leftJoin(users, eq(orders.userId, users.id))
      .leftJoin(externalOrders, eq(productionOrders.externalOrderId, externalOrders.id))
      .where(
        inArray(productionOrders.status, ["pending", "in_progress", "on_hold"]),
      )
      .orderBy(desc(productionOrders.priority), asc(productionOrders.startedAt)),

    // Принятые заказы с сайта, которых ещё нет в производстве
    db
      .select({
        id: orders.id,
        total: orders.totalPrice,
        isUrgent: orders.isUrgent,
        createdAt: orders.createdAt,
        clientName: users.name,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(inArray(orders.status, [...READY_TO_START]))
      .orderBy(desc(orders.isUrgent), asc(orders.createdAt))
      .limit(30),

    // То же для заказов менеджера: у них своё поле состояния
    db
      .select({
        id: externalOrders.id,
        total: externalOrders.totalPrice,
        createdAt: externalOrders.createdAt,
        clientName: externalOrders.clientName,
      })
      .from(externalOrders)
      .where(inArray(externalOrders.productionStatus, [...READY_TO_START]))
      .orderBy(asc(externalOrders.createdAt))
      .limit(30),
  ]);

  // «Ещё не запущен» - значит его нет на доске ни в каком состоянии,
  // включая завершённое: повторно в цех заказ не отправляют
  const [startedSite, startedExternal] = await Promise.all([
    db
      .select({ id: productionOrders.orderId })
      .from(productionOrders)
      .where(sql`${productionOrders.orderId} is not null`),
    db
      .select({ id: productionOrders.externalOrderId })
      .from(productionOrders)
      .where(sql`${productionOrders.externalOrderId} is not null`),
  ]);

  const startedSiteIds = new Set(startedSite.map((r) => r.id));
  const startedExternalIds = new Set(startedExternal.map((r) => r.id));

  const queue = [
    ...waitingSite
      .filter((o) => !startedSiteIds.has(o.id))
      .map((o) => ({
        kind: "site" as const,
        id: o.id,
        total: o.total,
        isUrgent: o.isUrgent,
        clientName: o.clientName,
      })),
    ...waitingExternal
      .filter((o) => !startedExternalIds.has(o.id))
      .map((o) => ({
        kind: "external" as const,
        id: o.id,
        total: o.total,
        isUrgent: false,
        clientName: o.clientName,
      })),
  ];

  const stageIds = await db
    .select({
      productionOrderId: productionOrderStages.productionOrderId,
      stageId: productionOrderStages.stageId,
      status: productionOrderStages.status,
    })
    .from(productionOrderStages)
    .where(
      active.length
        ? inArray(
            productionOrderStages.productionOrderId,
            active.map((a) => a.id),
          )
        : eq(productionOrderStages.id, -1),
    );

  return (
    <AdminPage
      title="Производство"
      subtitle={`В цехе: ${active.length} · В очереди: ${queue.length}`}
    >
      {/* ---------- Очередь на запуск ---------- */}
      {queue.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg text-ink">
            Ждут запуска в цех
          </h2>
          <ul className="flex flex-wrap gap-3">
            {queue.map((o) => (
              <li
                key={`${o.kind}-${o.id}`}
                className="flex items-center gap-4 rounded-xl border border-ink/10 bg-bone px-4 py-3"
              >
                <span>
                  <Link
                    href={
                      o.kind === "site"
                        ? `/admin/orders/${o.id}`
                        : `/admin/external-orders/${o.id}`
                    }
                    className="font-mono text-sm text-ink hover:text-brand"
                  >
                    № {o.id}
                    <span className="ml-1.5 text-[0.65rem] text-ink/40">
                      {o.kind === "site" ? "с сайта" : "менеджера"}
                    </span>
                  </Link>
                  {o.isUrgent && (
                    <Flame
                      className="ml-1.5 inline size-3.5 text-danger"
                      aria-label="Срочный"
                    />
                  )}
                  <span className="block text-xs text-ink/55">
                    {o.clientName ?? "-"} · {money.format(Number(o.total))}
                  </span>
                </span>

                {editable && (
                  <StartProductionForm
                    compact
                    field={o.kind === "site" ? "orderId" : "externalOrderId"}
                    orderId={o.id}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Доска ---------- */}
      {active.length === 0 ? (
        <AdminEmpty
          title="В цехе пусто"
          text={
            queue.length > 0
              ? "Запустите заказ из очереди выше - он появится на доске."
              : "Нет заказов ни в производстве, ни в очереди."
          }
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {stages.map((stage) => {
              const cards = active.filter((a) => a.currentStageId === stage.id);

              return (
                <section
                  key={stage.id}
                  className="flex w-72 shrink-0 flex-col rounded-xl border border-ink/10 bg-bone"
                >
                  <header className="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
                    <h2 className="font-display text-sm text-ink">
                      {stage.name}
                    </h2>
                    <span className="rounded-pill bg-ink/8 px-2 py-0.5 font-mono text-xs text-ink/60">
                      {cards.length}
                    </span>
                  </header>

                  <ul className="flex flex-col gap-2 p-3">
                    {cards.length === 0 && (
                      <li className="rounded-lg border border-dashed border-ink/12 px-3 py-6 text-center text-xs text-ink/35">
                        Пусто
                      </li>
                    )}

                    {cards.map((card) => {
                      const st = productionStatusOf(card.status);
                      const pr = priorityOf(card.priority);
                      const done = stageIds.filter(
                        (s) =>
                          s.productionOrderId === card.id &&
                          s.status === "completed",
                      ).length;

                      return (
                        <li
                          key={card.id}
                          className="rounded-lg border border-ink/10 bg-paper p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={
                                card.orderId
                                  ? `/admin/orders/${card.orderId}`
                                  : `/admin/external-orders/${card.externalOrderId}`
                              }
                              className="font-mono text-sm text-ink hover:text-brand"
                            >
                              № {card.orderId ?? card.externalOrderId}
                            </Link>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider",
                                st.className,
                              )}
                            >
                              {st.label}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-xs text-ink/60">
                            {card.siteClient ?? card.externalClient ?? "-"}
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                            <span className={cn("font-medium", pr.className)}>
                              {card.orderUrgent ? "Срочный" : pr.label}
                            </span>
                            <span className="font-mono text-ink/45">
                              {done}/{stages.length}
                            </span>
                          </div>

                          {card.startedAt && (
                            <p className="mt-1 font-mono text-[0.68rem] text-ink/40">
                              с {dt.format(card.startedAt)}
                            </p>
                          )}

                          <Link
                            href={`/admin/quality/inspect/${card.id}`}
                            className="mt-2 flex items-center gap-1.5 text-xs text-ink/45 hover:text-brand"
                          >
                            <ClipboardCheck className="size-3" aria-hidden />
                            Проверка качества
                          </Link>

                          {editable && (
                            <StageControls
                              productionOrderId={card.id}
                              onHold={card.status === "on_hold"}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </AdminPage>
  );
}
