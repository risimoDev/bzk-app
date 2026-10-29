import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, count, sql } from "drizzle-orm";
import { AlertTriangle, ClipboardCheck, ListChecks, ShieldAlert } from "lucide-react";
import { db } from "@/db";
import {
  qcChecklists,
  qcChecklistItems,
  qcInspections,
  qcDefects,
  productionStages,
  productionOrders,
  users,
} from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { qcResult, qcSeverity, qcDefectStatus, passRate } from "@/lib/quality";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Контроль качества · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminQuality() {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Контроль качества">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const [checklists, items, stages, inspectionStats, defectStats] = await Promise.all([
    db.select().from(qcChecklists).orderBy(asc(qcChecklists.sortOrder), asc(qcChecklists.id)),
    db
      .select()
      .from(qcChecklistItems)
      .orderBy(asc(qcChecklistItems.sortOrder), asc(qcChecklistItems.id)),
    db.select().from(productionStages).orderBy(asc(productionStages.sortOrder), asc(productionStages.id)),
    db
      .select({
        total: count(),
        passed: sql<number>`count(*) filter (where ${qcInspections.result} = 'passed')`,
        partial: sql<number>`count(*) filter (where ${qcInspections.result} = 'partial')`,
        failed: sql<number>`count(*) filter (where ${qcInspections.result} = 'failed')`,
      })
      .from(qcInspections),
    db
      .select({
        total: count(),
        open: sql<number>`count(*) filter (where ${qcDefects.status} = 'open')`,
        inFix: sql<number>`count(*) filter (where ${qcDefects.status} = 'in_fix')`,
        critical: sql<number>`count(*) filter (where ${qcDefects.severity} = 'critical' and ${qcDefects.status} in ('open','in_fix'))`,
      })
      .from(qcDefects),
  ]);

  const recent = await db
    .select({
      id: qcInspections.id,
      result: qcInspections.result,
      summary: qcInspections.summary,
      createdAt: qcInspections.createdAt,
      checklistName: qcChecklists.name,
      inspector: users.name,
      productionOrderId: qcInspections.productionOrderId,
      orderId: productionOrders.orderId,
    })
    .from(qcInspections)
    .leftJoin(qcChecklists, eq(qcChecklists.id, qcInspections.checklistId))
    .leftJoin(users, eq(users.id, qcInspections.inspectorId))
    .leftJoin(productionOrders, eq(productionOrders.id, qcInspections.productionOrderId))
    .orderBy(desc(qcInspections.createdAt), desc(qcInspections.id))
    .limit(15);

  const openDefects = await db
    .select({
      id: qcDefects.id,
      title: qcDefects.title,
      severity: qcDefects.severity,
      status: qcDefects.status,
      createdAt: qcDefects.createdAt,
      productionOrderId: qcDefects.productionOrderId,
      orderId: productionOrders.orderId,
    })
    .from(qcDefects)
    .leftJoin(productionOrders, eq(productionOrders.id, qcDefects.productionOrderId))
    .where(sql`${qcDefects.status} in ('open', 'in_fix')`)
    .orderBy(desc(qcDefects.createdAt))
    .limit(10);

  const [{ n: productionCount }] = await db
    .select({ n: count() })
    .from(productionOrders);

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const insp = inspectionStats[0];
  const def = defectStats[0];
  const rate = passRate(Number(insp?.passed ?? 0), Number(insp?.total ?? 0));

  return (
    <AdminPage
      title="Контроль качества"
      subtitle="Чек-листы по этапам, проверки и учёт брака"
      actions={
        <Link
          href="/admin/quality/defects"
          className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          ВСЕ ДЕФЕКТЫ · {Number(def?.total ?? 0)}
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat
          label="Проверок проведено"
          value={String(Number(insp?.total ?? 0))}
          hint={
            Number(insp?.total ?? 0) > 0
              ? `принято ${Number(insp?.passed ?? 0)}, замечания ${Number(insp?.partial ?? 0)}, брак ${Number(insp?.failed ?? 0)}`
              : "ни одной пока не было"
          }
        />
        <AdminStat
          label="Доля принятых"
          value={Number(insp?.total ?? 0) > 0 ? `${rate}%` : "-"}
          tone={rate >= 90 ? "brand" : rate > 0 ? "warn" : "plain"}
        />
        <AdminStat
          label="Дефектов в работе"
          value={String(Number(def?.open ?? 0) + Number(def?.inFix ?? 0))}
          hint={`открыто ${Number(def?.open ?? 0)}, исправляется ${Number(def?.inFix ?? 0)}`}
          tone={Number(def?.open ?? 0) > 0 ? "warn" : "plain"}
        />
        <AdminStat
          label="Критических"
          value={String(Number(def?.critical ?? 0))}
          tone={Number(def?.critical ?? 0) > 0 ? "warn" : "plain"}
        />
      </div>

      {productionCount === 0 && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-navy/8 px-5 py-4 text-sm text-ink/70">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
          <span>
            Проверка заводится на производственный заказ, а их пока ни одного. Заведите
            заказ в{" "}
            <Link href="/admin/production" className="text-brand hover:text-brand-bright">
              производстве
            </Link>{" "}
            - на его карточке появится кнопка проверки.
          </span>
        </p>
      )}

      {/* ------------------------------------------------ чек-листы */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
          <ListChecks className="size-5 text-brand" aria-hidden />
          Чек-листы
        </h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {checklists.map((c) => {
            const own = items.filter((i) => i.checklistId === c.id);
            const critical = own.filter((i) => i.isCritical).length;

            return (
              <section
                key={c.id}
                className={cn(
                  "overflow-hidden rounded-xl border border-ink/10 bg-bone",
                  !c.isActive && "opacity-60",
                )}
              >
                <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/10 px-5 py-3">
                  <div>
                    <Link
                      href={`/admin/quality/checklists/${c.id}`}
                      className="font-display text-base text-ink hover:text-brand"
                    >
                      {c.name}
                    </Link>
                    {c.description && (
                      <p className="mt-0.5 text-xs text-ink/50">{c.description}</p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-ink/45">
                    {c.stageId ? stageName.get(c.stageId) ?? "этап удалён" : "общий"}
                  </span>
                </header>

                <ul className="divide-y divide-ink/6 text-sm">
                  {own.map((i) => (
                    <li key={i.id} className="flex items-start gap-2.5 px-5 py-2.5">
                      {i.isCritical ? (
                        <ShieldAlert
                          className="mt-0.5 size-3.5 shrink-0 text-danger"
                          aria-label="Критический пункт"
                        />
                      ) : (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink/25" />
                      )}
                      <span className="text-ink/80">{i.text}</span>
                    </li>
                  ))}
                </ul>

                <footer className="border-t border-ink/10 px-5 py-2 text-xs text-ink/45">
                  Пунктов: {own.length}
                  {critical > 0 && `, из них критических ${critical}`}
                </footer>
              </section>
            );
          })}
        </div>

        <p className="mt-3 max-w-2xl text-xs text-ink/45">
          Критический пункт блокирует выпуск: если он не пройден, проверка целиком
          считается браком, а не замечанием.
        </p>
      </section>

      {/* -------------------------------------------------- проверки */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
          <ClipboardCheck className="size-5 text-brand" aria-hidden />
          Последние проверки
        </h2>

        {recent.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty title="Проверок ещё не было" />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {recent.map((r) => {
              const st = qcResult(r.result);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                >
                  <div>
                    <Link
                      href={`/admin/quality/inspections/${r.id}`}
                      className="text-ink hover:text-brand"
                    >
                      {r.checklistName ?? "Без чек-листа"}
                    </Link>
                    <span className="block text-xs text-ink/45">
                      {r.orderId ? `заказ № ${r.orderId}` : `произв. заказ ${r.productionOrderId}`}
                      {r.inspector && ` · ${r.inspector}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    {r.createdAt && (
                      <span className="font-mono text-xs text-ink/45">
                        {dt.format(r.createdAt)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------- дефекты */}
      {openDefects.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
            <AlertTriangle className="size-5 text-warn" aria-hidden />
            Дефекты в работе
          </h2>

          <ul className="mt-4 flex flex-col gap-2">
            {openDefects.map((d) => {
              const sv = qcSeverity(d.severity);
              const st = qcDefectStatus(d.status);
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                >
                  <div>
                    <span className="text-ink">{d.title}</span>
                    <span className="block text-xs text-ink/45">
                      {d.orderId ? `заказ № ${d.orderId}` : `произв. заказ ${d.productionOrderId}`}
                      {d.createdAt && ` · ${dt.format(d.createdAt)}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        sv.className,
                      )}
                    >
                      {sv.label}
                    </span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <Link
            href="/admin/quality/defects"
            className="mt-3 inline-block text-sm text-brand hover:text-brand-bright"
          >
            Все дефекты и смена статусов
          </Link>
        </section>
      )}
    </AdminPage>
  );
}
