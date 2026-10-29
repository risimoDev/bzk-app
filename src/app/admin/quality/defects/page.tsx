import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, count, and, type SQL } from "drizzle-orm";
import { ArrowLeft, Link2, Camera } from "lucide-react";
import { db } from "@/db";
import { qcDefects, qcInspections, productionOrders, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import {
  qcSeverity,
  qcDefectStatus,
  QC_DEFECT_STATUS,
  QC_SEVERITY,
  type QcDefectStatus,
  type QcSeverity,
} from "@/lib/quality";
import { DefectStatusControls, DeleteDefectButton } from "./DefectControls";
import { cn } from "@/lib/cn";
import { isKeyOf } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Дефекты · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const PER_PAGE = 50;

export default async function AdminDefects({
  searchParams,
}: PageProps<"/admin/quality/defects">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Дефекты">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const rawStatus = String(sp.status ?? "");
  const rawSeverity = String(sp.severity ?? "");

  // Фильтры принимаем только из известного набора: чужое значение в
  // адресе иначе ушло бы прямо в запрос
  const status = isKeyOf(QC_DEFECT_STATUS, rawStatus) ? (rawStatus as QcDefectStatus) : null;
  const severity = isKeyOf(QC_SEVERITY, rawSeverity) ? (rawSeverity as QcSeverity) : null;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(qcDefects.status, status));
  if (severity) conditions.push(eq(qcDefects.severity, severity));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = pageFrom(sp.page);

  const [rows, byStatus, bySeverity, [found]] = await Promise.all([
    db
      .select({
        id: qcDefects.id,
        title: qcDefects.title,
        description: qcDefects.description,
        severity: qcDefects.severity,
        status: qcDefects.status,
        photoPath: qcDefects.photoPath,
        createdAt: qcDefects.createdAt,
        fixedAt: qcDefects.fixedAt,
        productionOrderId: qcDefects.productionOrderId,
        orderId: productionOrders.orderId,
        inspectionId: qcDefects.inspectionId,
        inspectionResult: qcInspections.result,
        reporter: users.name,
      })
      .from(qcDefects)
      .leftJoin(productionOrders, eq(productionOrders.id, qcDefects.productionOrderId))
      .leftJoin(qcInspections, eq(qcInspections.id, qcDefects.inspectionId))
      .leftJoin(users, eq(users.id, qcDefects.reportedBy))
      .where(where)
      .orderBy(desc(qcDefects.createdAt), desc(qcDefects.id))
      .limit(PER_PAGE)
      .offset(offsetOf(page, PER_PAGE)),
    db.select({ status: qcDefects.status, n: count() }).from(qcDefects).groupBy(qcDefects.status),
    db
      .select({ severity: qcDefects.severity, n: count() })
      .from(qcDefects)
      .groupBy(qcDefects.severity),
    db.select({ n: count() }).from(qcDefects).where(where),
  ]);

  const canDelete = await can("orders", "delete");
  const statusCount = new Map(byStatus.map((r) => [r.status, Number(r.n)]));
  const severityCount = new Map(bySeverity.map((r) => [r.severity, Number(r.n)]));
  const total = byStatus.reduce((s, r) => s + Number(r.n), 0);

  return (
    <AdminPage
      title="Дефекты"
      subtitle={
        total === 0
          ? "Записей нет"
          : `Всего ${total}${status || severity ? `, показано ${rows.length}` : ""}`
      }
      actions={
        <Link
          href="/admin/quality"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К КОНТРОЛЮ КАЧЕСТВА
        </Link>
      }
    >
      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-2">
          <Chip href={buildHref(null, severity)} active={!status}>
            Любой статус · {total}
          </Chip>
          {(Object.keys(QC_DEFECT_STATUS) as QcDefectStatus[]).map((key) => (
            <Chip key={key} href={buildHref(key, severity)} active={status === key}>
              {QC_DEFECT_STATUS[key].label} · {statusCount.get(key) ?? 0}
            </Chip>
          ))}
        </nav>

        <nav className="flex flex-wrap gap-2">
          <Chip href={buildHref(status, null)} active={!severity}>
            Любая важность
          </Chip>
          {(Object.keys(QC_SEVERITY) as QcSeverity[]).map((key) => (
            <Chip key={key} href={buildHref(status, key)} active={severity === key}>
              {QC_SEVERITY[key].label} · {severityCount.get(key) ?? 0}
            </Chip>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title={total === 0 ? "Дефектов нет" : "Под фильтр ничего не подошло"}
            text={
              total === 0
                ? "Записи появляются при проверке производственного заказа."
                : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.map((d) => {
            const sv = qcSeverity(d.severity);
            const st = qcDefectStatus(d.status);

            return (
              <li
                key={d.id}
                className="rounded-xl border border-ink/10 bg-bone px-5 py-4"
              >
                <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                  <div className="min-w-64 flex-1">
                    <span className="flex flex-wrap items-center gap-2.5">
                      <span className="text-ink">{d.title}</span>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          sv.className,
                        )}
                      >
                        {sv.label}
                      </span>
                    </span>

                    {d.description && (
                      <p className="mt-1 text-sm text-ink/60">{d.description}</p>
                    )}

                    <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink/45">
                      {d.orderId ? (
                        <Link
                          href={`/admin/orders/${d.orderId}`}
                          className="flex items-center gap-1 hover:text-brand"
                        >
                          <Link2 className="size-3" aria-hidden />
                          заказ № {d.orderId}
                        </Link>
                      ) : (
                        <span>произв. заказ {d.productionOrderId}</span>
                      )}
                      {d.inspectionId && (
                        <Link
                          href={`/admin/quality/inspections/${d.inspectionId}`}
                          className="hover:text-brand"
                        >
                          из проверки
                        </Link>
                      )}
                      {d.reporter && <span>нашёл: {d.reporter}</span>}
                      {d.createdAt && <span>{dt.format(d.createdAt)}</span>}
                      {d.fixedAt && (
                        <span className="text-ok">закрыт {dt.format(d.fixedAt)}</span>
                      )}
                    </p>
                  </div>

                  {d.photoPath && (
                    <a
                      href={`/api/qc-photo/${encodeURIComponent(d.photoPath.replace(/^qc\//, ""))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-ink/12 px-3 py-1.5 text-xs text-ink/60 hover:border-ink/30 hover:text-ink"
                    >
                      <Camera className="size-3.5" aria-hidden />
                      Фотоотчёт
                    </a>
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

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-3">
                  <DefectStatusControls defectId={d.id} status={d.status} />
                  {canDelete && <DeleteDefectButton defectId={d.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPager page={page} perPage={PER_PAGE} total={Number(found?.n ?? 0)} basePath="/admin/quality/defects" params={sp} />
    </AdminPage>
  );
}

/** Ссылка фильтра, сохраняющая вторую ось. */
function buildHref(status: QcDefectStatus | null, severity: QcSeverity | null) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const qs = params.toString();
  return qs ? `/admin/quality/defects?${qs}` : "/admin/quality/defects";
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
