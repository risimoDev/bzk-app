import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ShieldAlert, Link2 } from "lucide-react";
import { db } from "@/db";
import {
  qcInspections,
  qcInspectionResults,
  qcChecklists,
  qcChecklistItems,
  qcDefects,
  productionOrders,
  productionOrderStages,
  productionStages,
  users,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  qcResult,
  qcSeverity,
  qcDefectStatus,
  QC_ITEM_STATUS,
  type QcItemStatus,
} from "@/lib/quality";
import { DefectForm } from "../../inspect/[id]/DefectForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Протокол проверки · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminInspection({
  params,
}: PageProps<"/admin/quality/inspections/[id]">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Протокол проверки">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const inspectionId = Number(id);
  if (!Number.isInteger(inspectionId) || inspectionId <= 0) notFound();

  const [inspection] = await db
    .select({
      id: qcInspections.id,
      result: qcInspections.result,
      summary: qcInspections.summary,
      createdAt: qcInspections.createdAt,
      productionOrderId: qcInspections.productionOrderId,
      orderId: productionOrders.orderId,
      checklistName: qcChecklists.name,
      stageName: productionStages.name,
      inspector: users.name,
    })
    .from(qcInspections)
    .leftJoin(qcChecklists, eq(qcChecklists.id, qcInspections.checklistId))
    .leftJoin(productionOrders, eq(productionOrders.id, qcInspections.productionOrderId))
    // Этап проверки - строка production_order_stages, название лежит в
    // справочнике за ней; напрямую по productionStages здесь не соединить
    .leftJoin(
      productionOrderStages,
      eq(productionOrderStages.id, qcInspections.productionStageId),
    )
    .leftJoin(productionStages, eq(productionStages.id, productionOrderStages.stageId))
    .leftJoin(users, eq(users.id, qcInspections.inspectorId))
    .where(eq(qcInspections.id, inspectionId))
    .limit(1);

  if (!inspection) notFound();

  const [marks, defects] = await Promise.all([
    db
      .select({
        id: qcInspectionResults.id,
        status: qcInspectionResults.status,
        comment: qcInspectionResults.comment,
        text: qcChecklistItems.text,
        description: qcChecklistItems.description,
        critical: qcChecklistItems.isCritical,
        sortOrder: qcChecklistItems.sortOrder,
      })
      .from(qcInspectionResults)
      .innerJoin(
        qcChecklistItems,
        eq(qcChecklistItems.id, qcInspectionResults.checklistItemId),
      )
      .where(eq(qcInspectionResults.inspectionId, inspectionId))
      .orderBy(asc(qcChecklistItems.sortOrder), asc(qcChecklistItems.id)),
    db
      .select()
      .from(qcDefects)
      .where(eq(qcDefects.inspectionId, inspectionId))
      .orderBy(asc(qcDefects.id)),
  ]);

  const st = qcResult(inspection.result);
  const failed = marks.filter((m) => m.status === "fail");
  const canEdit = await can("orders", "edit");

  return (
    <AdminPage
      title={`Протокол № ${inspection.id}`}
      subtitle={[
        inspection.checklistName,
        inspection.stageName,
        inspection.inspector && `проверял: ${inspection.inspector}`,
        inspection.createdAt && dt.format(inspection.createdAt),
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          <Link
            href="/admin/quality"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            К КОНТРОЛЮ КАЧЕСТВА
          </Link>
          {inspection.orderId && (
            <Link
              href={`/admin/orders/${inspection.orderId}`}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
            >
              <Link2 className="size-3.5" aria-hidden />
              ЗАКАЗ № {inspection.orderId}
            </Link>
          )}
        </>
      }
    >
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "rounded px-3 py-1 font-display text-[0.62rem] tracking-wider",
              st.className,
            )}
          >
            {st.label}
          </span>
          <span className="text-sm text-ink/55">
            Пунктов {marks.length}
            {failed.length > 0 && `, не пройдено ${failed.length}`}
          </span>
        </div>

        {inspection.summary && (
          <p className="mt-4 rounded-xl border border-ink/10 bg-bone px-5 py-4 text-sm text-ink/75">
            {inspection.summary}
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-xl border border-ink/10 bg-bone">
          <ul className="divide-y divide-ink/6 text-sm">
            {marks.map((m) => {
              const status =
                QC_ITEM_STATUS[(m.status ?? "ok") as QcItemStatus] ?? QC_ITEM_STATUS.ok;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-64 flex-1">
                    <span className="flex items-start gap-2 text-ink">
                      {m.critical && (
                        <ShieldAlert
                          className="mt-0.5 size-3.5 shrink-0 text-danger"
                          aria-label="Критический пункт"
                        />
                      )}
                      {m.text}
                    </span>
                    {m.comment && (
                      <span className="mt-1 block rounded-lg bg-danger/8 px-3 py-1.5 text-xs text-danger">
                        {m.comment}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                      status.className,
                    )}
                  >
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">
            Дефекты по этой проверке{defects.length > 0 && ` - ${defects.length}`}
          </h2>

          {defects.length === 0 ? (
            <p className="mt-2 text-sm text-ink/50">Пока ни одного не заведено.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {defects.map((d) => {
                const sv = qcSeverity(d.severity);
                const ds = qcDefectStatus(d.status);
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                  >
                    <div>
                      <span className="text-ink">{d.title}</span>
                      {d.description && (
                        <span className="block text-xs text-ink/55">{d.description}</span>
                      )}
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
                          ds.className,
                        )}
                      >
                        {ds.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit && (
            <div className="mt-4">
              <DefectForm
                productionOrderId={inspection.productionOrderId}
                inspectionId={inspection.id}
              />
            </div>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
