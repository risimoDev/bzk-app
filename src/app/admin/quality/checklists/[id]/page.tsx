import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, count } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import {
  qcChecklists,
  qcChecklistItems,
  qcInspections,
  productionStages,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { ChecklistItemForm } from "./ChecklistItemForm";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Чек-лист · Админка",
  robots: { index: false, follow: false },
};

export default async function AdminChecklist({
  params,
}: PageProps<"/admin/quality/checklists/[id]">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Чек-лист">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const checklistId = parseId(id);
  if (checklistId === null) notFound();

  const [checklist] = await db
    .select({
      id: qcChecklists.id,
      name: qcChecklists.name,
      description: qcChecklists.description,
      isActive: qcChecklists.isActive,
      stageId: qcChecklists.stageId,
      stageName: productionStages.name,
    })
    .from(qcChecklists)
    .leftJoin(productionStages, eq(productionStages.id, qcChecklists.stageId))
    .where(eq(qcChecklists.id, checklistId))
    .limit(1);

  if (!checklist) notFound();

  const [items, [used]] = await Promise.all([
    db
      .select()
      .from(qcChecklistItems)
      .where(eq(qcChecklistItems.checklistId, checklistId))
      .orderBy(asc(qcChecklistItems.sortOrder), asc(qcChecklistItems.id)),
    db
      .select({ n: count() })
      .from(qcInspections)
      .where(eq(qcInspections.checklistId, checklistId)),
  ]);

  const canEdit = await can("settings", "edit");
  const critical = items.filter((i) => i.isCritical).length;
  const nextSortOrder = items.reduce((max, i) => Math.max(max, i.sortOrder ?? 0), 0) + 1;

  return (
    <AdminPage
      title={checklist.name}
      subtitle={[
        checklist.description,
        checklist.stageName ? `этап: ${checklist.stageName}` : "общий чек-лист",
        `проверок по нему: ${Number(used?.n ?? 0)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
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
      <div className="max-w-4xl">
        {items.length === 0 ? (
          <AdminEmpty
            title="Пунктов нет"
            text="Добавьте хотя бы один - по пустому чек-листу проверку не провести."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/10 px-5 py-3">
              <h2 className="font-display text-sm text-ink">
                Пункты проверки - {items.length}
              </h2>
              {critical > 0 && (
                <span className="text-xs text-ink/50">
                  критических: {critical}
                </span>
              )}
            </header>

            <ul className="divide-y divide-ink/6 text-sm">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  checklistId={checklistId}
                  canEdit={canEdit}
                  item={{
                    id: item.id,
                    text: item.text,
                    description: item.description ?? "",
                    isCritical: item.isCritical === true,
                    sortOrder: item.sortOrder ?? 0,
                  }}
                />
              ))}
            </ul>
          </div>
        )}

        {canEdit ? (
          <div className="mt-5">
            <ChecklistItemForm
              checklistId={checklistId}
              nextSortOrder={nextSortOrder}
            />
          </div>
        ) : (
          <p className="mt-5 text-xs text-ink/45">
            Менять чек-листы может администратор.
          </p>
        )}

        <p className="mt-6 text-xs text-ink/45">
          Пункт, по которому уже проводились проверки, удалить нельзя - иначе прошедшие
          проверки перестанут читаться. Такой пункт можно только переписать.
        </p>
      </div>
    </AdminPage>
  );
}
