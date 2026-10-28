import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import {
  qcChecklists,
  qcChecklistItems,
  qcInspections,
  productionOrders,
  productionOrderStages,
  productionStages,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { qcResult } from "@/lib/quality";
import { InspectionForm, type ChecklistOption } from "./InspectionForm";
import { DefectForm } from "./DefectForm";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Проверка · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminInspect({
  params,
}: PageProps<"/admin/quality/inspect/[id]">) {
  if (!(await can("orders", "edit"))) {
    return (
      <AdminPage title="Проверка">
        <AdminEmpty
          title="Нет доступа"
          text="Проводить проверки может тот, кто ведёт заказы."
        />
      </AdminPage>
    );
  }

  const { id } = await params;
  const productionOrderId = parseId(id);
  if (productionOrderId === null) notFound();

  const [order] = await db
    .select({
      id: productionOrders.id,
      orderId: productionOrders.orderId,
      status: productionOrders.status,
      currentStageId: productionOrders.currentStageId,
      stageName: productionStages.name,
      deadline: productionOrders.deadline,
    })
    .from(productionOrders)
    .leftJoin(productionStages, eq(productionStages.id, productionOrders.currentStageId))
    .where(eq(productionOrders.id, productionOrderId))
    .limit(1);

  if (!order) notFound();

  // Внимание: «этап проверки» - это строка production_order_stages, то есть
  // этап конкретного заказа, а не запись из справочника production_stages.
  // Названия у них одинаковые, а внешние ключи разные: у qc_checklists.stage_id
  // ссылка как раз на справочник. Перепутать легко, база не даст.
  const [checklists, items, orderStages, previous] = await Promise.all([
    db
      .select()
      .from(qcChecklists)
      .where(eq(qcChecklists.isActive, true))
      .orderBy(asc(qcChecklists.sortOrder), asc(qcChecklists.id)),
    db
      .select()
      .from(qcChecklistItems)
      .orderBy(asc(qcChecklistItems.sortOrder), asc(qcChecklistItems.id)),
    db
      .select({
        id: productionOrderStages.id,
        stageId: productionOrderStages.stageId,
        name: productionStages.name,
        status: productionOrderStages.status,
      })
      .from(productionOrderStages)
      .innerJoin(productionStages, eq(productionStages.id, productionOrderStages.stageId))
      .where(eq(productionOrderStages.productionOrderId, productionOrderId))
      .orderBy(asc(productionStages.sortOrder)),
    db
      .select({
        id: qcInspections.id,
        result: qcInspections.result,
        createdAt: qcInspections.createdAt,
        checklistName: qcChecklists.name,
      })
      .from(qcInspections)
      .leftJoin(qcChecklists, eq(qcChecklists.id, qcInspections.checklistId))
      .where(eq(qcInspections.productionOrderId, productionOrderId))
      .orderBy(desc(qcInspections.createdAt)),
  ]);

  const options: ChecklistOption[] = checklists
    .map((c) => ({
      id: c.id,
      name: c.name,
      stageId: c.stageId,
      items: items
        .filter((i) => i.checklistId === c.id)
        .map((i) => ({
          id: i.id,
          text: i.text,
          description: i.description ?? "",
          critical: i.isCritical === true,
        })),
    }))
    // Пустой чек-лист в выборе не нужен: по нему нечего отмечать
    .filter((c) => c.items.length > 0);

  // Подставляем чек-лист текущего этапа: обычно проверяют именно то, что
  // только что закончили
  const forStage = options.find((c) => c.stageId === order.currentStageId);

  // И тот же этап - в выборе строки заказа
  const currentOrderStage = orderStages.find((s) => s.stageId === order.currentStageId);

  return (
    <AdminPage
      title={`Проверка производственного заказа ${order.id}`}
      subtitle={[
        order.orderId ? `заказ № ${order.orderId}` : "внешний заказ",
        order.stageName ? `этап: ${order.stageName}` : null,
        previous.length > 0 ? `проверок было: ${previous.length}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <Link
          href="/admin/production"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К ПРОИЗВОДСТВУ
        </Link>
      }
    >
      {previous.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-2">
          {previous.map((p) => {
            const st = qcResult(p.result);
            return (
              <li key={p.id}>
                <Link
                  href={`/admin/quality/inspections/${p.id}`}
                  className="flex items-center gap-2 rounded-lg border border-ink/12 px-3 py-1.5 text-xs text-ink/60 hover:border-ink/30 hover:text-ink"
                >
                  {p.checklistName ?? "проверка"}
                  {p.createdAt && (
                    <span className="font-mono text-ink/40">{dt.format(p.createdAt)}</span>
                  )}
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <InspectionForm
        productionOrderId={order.id}
        checklists={options}
        stages={orderStages.map((s) => ({ id: s.id, name: s.name }))}
        defaultChecklistId={forStage?.id ?? options[0]?.id ?? 0}
        defaultStageId={currentOrderStage?.id ?? null}
      />

      <section className="mt-10 max-w-4xl">
        <h2 className="font-display text-lg text-ink">Зарегистрировать дефект</h2>
        <p className="mt-1 text-sm text-ink/55">
          Отдельно от проверки: дефект можно завести и без неё - например, когда брак
          нашёлся при упаковке.
        </p>
        <div className="mt-4">
          <DefectForm productionOrderId={order.id} />
        </div>
      </section>
    </AdminPage>
  );
}
