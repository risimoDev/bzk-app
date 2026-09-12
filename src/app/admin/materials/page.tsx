import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, ilike, and, type SQL } from "drizzle-orm";
import { Search, TriangleAlert, Plus, BellRing } from "lucide-react";
import { db } from "@/db";
import { materials, materialsStock, stockAlerts } from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { CATEGORY, categoryOf, stockLevel, type MaterialCategory } from "@/lib/materials";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Склад · Админка",
  robots: { index: false, follow: false },
};

const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const alertDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

export default async function AdminMaterials(
  props: PageProps<"/admin/materials">,
) {
  if (!(await can("materials", "view"))) {
    return (
      <AdminPage title="Склад">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть склад." />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const query = one(sp.q).trim();
  const category = one(sp.category);
  const onlyLow = one(sp.low) === "1";

  const filters: SQL[] = [];
  if (query) filters.push(ilike(materials.name, `%${query}%`));
  if (category && category in CATEGORY) {
    filters.push(eq(materials.category, category as MaterialCategory));
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: materials.id,
      name: materials.name,
      unit: materials.unit,
      category: materials.category,
      minStock: materials.minStock,
      costPerUnit: materials.costPerUnit,
      supplier: materials.supplier,
      isActive: materials.isActive,
      quantity: materialsStock.quantity,
    })
    .from(materials)
    .leftJoin(materialsStock, eq(materialsStock.materialId, materials.id))
    .where(where)
    .orderBy(asc(materials.name));

  // Уровень остатка считается в коде, поэтому и фильтр «на исходе» -
  // тоже здесь: в SQL пришлось бы дублировать ту же формулу
  const withLevel = rows.map((r) => ({
    ...r,
    level: stockLevel(Number(r.quantity ?? 0), Number(r.minStock ?? 0)),
  }));

  const visible = onlyLow
    ? withLevel.filter((r) => r.level.tone !== "ok")
    : withLevel;

  const lowCount = withLevel.filter((r) => r.level.tone !== "ok").length;
  const totalValue = withLevel.reduce(
    (sum, r) => sum + Number(r.quantity ?? 0) * Number(r.costPerUnit ?? 0),
    0,
  );

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (category) p.set("category", category);
    if (onlyLow) p.set("low", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/materials?${s}` : "/admin/materials";
  };

  const canCreate = await can("materials", "create");

  // Открытые оповещения о нехватке. Их пишет applyMovement в момент,
  // когда остаток проваливается ниже минимума, и закрывает сам, когда
  // приходит поставка: по ним видно, когда именно материал кончился
  const alerts = await db
    .select({
      id: stockAlerts.id,
      message: stockAlerts.message,
      alertType: stockAlerts.alertType,
      createdAt: stockAlerts.createdAt,
      materialId: stockAlerts.materialId,
    })
    .from(stockAlerts)
    .where(eq(stockAlerts.isResolved, false))
    .orderBy(desc(stockAlerts.createdAt))
    .limit(20);

  return (
    <AdminPage
      title="Склад"
      subtitle={`Позиций: ${rows.length}`}
      actions={
        canCreate && (
          <Link
            href="/admin/materials/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВЫЙ МАТЕРИАЛ
          </Link>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Позиций на складе" value={String(rows.length)} />
        <AdminStat
          label="Требуют закупки"
          value={String(lowCount)}
          tone={lowCount > 0 ? "warn" : "plain"}
          hint={lowCount > 0 ? "остаток ниже минимума или близко к нему" : undefined}
        />
        <AdminStat
          label="Стоимость остатков"
          value={money.format(totalValue)}
          tone="brand"
        />
      </div>

      {alerts.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-xl border border-warn/30 bg-warn/8">
          <header className="flex items-center gap-2 border-b border-warn/20 px-5 py-2.5">
            <BellRing className="size-4 text-warn" aria-hidden />
            <h2 className="font-display text-sm text-ink">
              Открытые оповещения о нехватке
            </h2>
          </header>
          <ul className="flex flex-col">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-warn/12 px-5 py-2 text-sm last:border-0"
              >
                <Link
                  href={`/admin/materials/${a.materialId}`}
                  className="text-ink hover:text-brand"
                >
                  {a.message}
                </Link>
                <span className="font-mono text-xs text-ink/45">
                  {a.alertType === "out_of_stock" ? "закончился" : "ниже минимума"}
                  {a.createdAt && ` · ${alertDate.format(a.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form action="/admin/materials" className="flex gap-2">
          {category && <input type="hidden" name="category" value={category} />}
          {onlyLow && <input type="hidden" name="low" value="1" />}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/30"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Название материала"
              aria-label="Поиск по материалам"
              className="w-64 rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-sm text-bone transition-colors hover:bg-brand"
          >
            Искать
          </button>
        </form>

        <nav aria-label="Фильтры" className="flex flex-wrap gap-1.5">
          <Chip href={link({ category: "", low: "" })} active={!category && !onlyLow}>
            Все
          </Chip>
          {(Object.keys(CATEGORY) as MaterialCategory[]).map((key) => (
            <Chip key={key} href={link({ category: key })} active={category === key}>
              {CATEGORY[key]}
            </Chip>
          ))}
          <Chip href={link({ low: onlyLow ? "" : "1" })} active={onlyLow}>
            Требуют закупки
          </Chip>
        </nav>
      </div>

      <div className="mt-5">
        {visible.length === 0 ? (
          <AdminEmpty
            title={onlyLow ? "Всё в наличии" : "Ничего не найдено"}
            text={onlyLow ? "Ни один материал не опустился ниже минимума." : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <Th>Материал</Th>
                  <Th>Категория</Th>
                  <Th className="text-right">Остаток</Th>
                  <Th className="text-right">Минимум</Th>
                  <Th className="text-right">Цена</Th>
                  <Th>Состояние</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-b border-ink/6 last:border-0 hover:bg-paper",
                      !m.isActive && "opacity-55",
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/materials/${m.id}`}
                        className="text-ink hover:text-brand"
                      >
                        {m.name}
                      </Link>
                      {m.supplier && (
                        <span className="block text-xs text-ink/45">
                          {m.supplier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/60">
                      {categoryOf(m.category)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {num.format(Number(m.quantity ?? 0))}{" "}
                      <span className="text-xs text-ink/45">{m.unit}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/50">
                      {num.format(Number(m.minStock ?? 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                      {m.costPerUnit ? money.format(Number(m.costPerUnit)) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          m.level.className,
                        )}
                      >
                        {m.level.tone !== "ok" && (
                          <TriangleAlert className="size-3.5" aria-hidden />
                        )}
                        {m.level.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
        "rounded-lg px-3 py-1.5 text-xs transition-colors",
        active
          ? "bg-ink text-bone"
          : "border border-ink/12 text-ink/60 hover:border-brand/40 hover:text-brand",
      )}
    >
      {children}
    </Link>
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
