import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { materials, materialsStock, materialsMovements } from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  categoryOf,
  stockLevel,
  MOVEMENT_TYPE,
  REFERENCE_TYPE,
} from "@/lib/materials";
import { MovementForm } from "./MovementForm";
import { MaterialForm } from "../MaterialForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Материал · Админка",
  robots: { index: false, follow: false },
};

const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminMaterial(
  props: PageProps<"/admin/materials/[id]">,
) {
  if (!(await can("materials", "view"))) {
    return (
      <AdminPage title="Материал">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();

  const [material] = await db
    .select({
      id: materials.id,
      name: materials.name,
      unit: materials.unit,
      category: materials.category,
      minStock: materials.minStock,
      costPerUnit: materials.costPerUnit,
      supplier: materials.supplier,
      description: materials.description,
      materialType: materials.materialType,
      widthMm: materials.widthMm,
      heightMm: materials.heightMm,
      isActive: materials.isActive,
      quantity: materialsStock.quantity,
    })
    .from(materials)
    .leftJoin(materialsStock, eq(materialsStock.materialId, materials.id))
    .where(eq(materials.id, Number(id)))
    .limit(1);

  if (!material) notFound();

  const movements = await db
    .select()
    .from(materialsMovements)
    .where(eq(materialsMovements.materialId, material.id))
    .orderBy(desc(materialsMovements.createdAt))
    .limit(50);

  const quantity = Number(material.quantity ?? 0);
  const level = stockLevel(quantity, Number(material.minStock ?? 0));
  const editable = await can("materials", "edit");

  const size =
    material.widthMm && material.heightMm
      ? `${num.format(Number(material.widthMm))}×${num.format(Number(material.heightMm))} мм`
      : null;

  return (
    <AdminPage
      title={material.name}
      subtitle={categoryOf(material.category)}
      actions={
        <Link
          href="/admin/materials"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К списку
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminStat
              label="Остаток"
              value={`${num.format(quantity)} ${material.unit}`}
              tone={level.tone === "ok" ? "plain" : "warn"}
              hint={level.label}
            />
            <AdminStat
              label="Минимум"
              value={`${num.format(Number(material.minStock ?? 0))} ${material.unit}`}
            />
            <AdminStat
              label="Стоимость остатка"
              value={money.format(quantity * Number(material.costPerUnit ?? 0))}
              tone="brand"
            />
          </div>

          {level.tone !== "ok" && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {level.label}. Стоит запланировать закупку.
            </p>
          )}

          {editable && (
            <details className="mt-8 rounded-xl border border-ink/10 bg-bone p-5">
              <summary className="cursor-pointer font-display text-lg text-ink">
                Карточка материала
              </summary>
              <div className="mt-4">
                <MaterialForm
                  value={{
                    id: material.id,
                    name: material.name,
                    unit: material.unit,
                    costPerUnit: material.costPerUnit,
                    minStock: material.minStock,
                    description: material.description,
                    category: material.category,
                    materialType: material.materialType,
                    supplier: material.supplier,
                    widthMm: material.widthMm,
                    heightMm: material.heightMm,
                    isActive: material.isActive,
                  }}
                />
              </div>
            </details>
          )}

          <h2 className="mb-3 mt-8 font-display text-lg text-ink">
            История движений
          </h2>

          {movements.length === 0 ? (
            <AdminEmpty
              title="Движений нет"
              text="Приход и расход появятся здесь после первой записи."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>Когда</Th>
                    <Th>Тип</Th>
                    <Th className="text-right">Количество</Th>
                    <Th>Основание</Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const t = MOVEMENT_TYPE[m.type];
                    return (
                      <tr
                        key={m.id}
                        className="border-b border-ink/6 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                          {m.createdAt ? dt.format(m.createdAt) : "-"}
                        </td>
                        <td className={cn("px-4 py-3 text-sm", t.className)}>
                          {t.label}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums",
                            t.className,
                          )}
                        >
                          {m.type === "in" ? "+" : "−"}
                          {num.format(Number(m.quantity))} {material.unit}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink/55">
                          {REFERENCE_TYPE[m.referenceType]}
                          {m.comment && (
                            <span className="block text-ink/45">{m.comment}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          {editable ? (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="mb-4 font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                Новое движение
              </h2>
              <MovementForm materialId={material.id} unit={material.unit} />
            </div>
          ) : (
            <p className="rounded-xl border border-ink/10 bg-bone p-5 text-sm text-ink/55">
              У вашей роли нет права менять склад.
            </p>
          )}

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              Характеристики
            </h2>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm">
              <Row label="Единица" value={material.unit} />
              {material.costPerUnit && (
                <Row
                  label="Цена за единицу"
                  value={money.format(Number(material.costPerUnit))}
                  mono
                />
              )}
              {size && <Row label="Размер" value={size} mono />}
              {material.supplier && (
                <Row label="Поставщик" value={material.supplier} />
              )}
              <Row
                label="В калькуляторе"
                value={material.isActive ? "используется" : "отключён"}
              />
            </dl>

            {material.description && (
              <p className="mt-4 border-t border-ink/10 pt-3 text-sm text-ink/60">
                {material.description}
              </p>
            )}
          </div>
        </aside>
      </div>
    </AdminPage>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink/45">{label}</dt>
      <dd className={cn("text-right text-ink/80", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-display text-[0.62rem] font-semibold tracking-[0.16em] text-ink/40",
        className,
      )}
    >
      {children}
    </th>
  );
}
