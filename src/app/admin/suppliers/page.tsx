import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq, ilike, or, sql, inArray, and, type SQL } from "drizzle-orm";
import { ChevronRight, Mail, Phone, Plus, Search } from "lucide-react";
import { db } from "@/db";
import { externalOrderItems, purchaseOrders, suppliers } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Подрядчики · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

/**
 * Подрядчики - они же поставщики.
 *
 * У них закупают материалы и им же перезаказывают позиции заказов,
 * поэтому в списке видно и то и другое.
 */
export default async function AdminSuppliers({
  searchParams,
}: PageProps<"/admin/suppliers">) {
  if (!(await can("materials", "view"))) {
    return (
      <AdminPage title="Подрядчики">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть склад." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const search = one(sp.q).trim().slice(0, 100);
  const onlyActive = one(sp.all) !== "1";

  const conditions: SQL[] = [];
  if (onlyActive) conditions.push(eq(suppliers.isActive, true));
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(suppliers.name, like),
      ilike(suppliers.contactPerson, like),
      ilike(suppliers.phone, like),
      ilike(suppliers.email, like),
    );
    if (cond) conditions.push(cond);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const canCreate = await can("materials", "create");

  const [rows, [total]] = await Promise.all([
    db.select().from(suppliers).where(where).orderBy(asc(suppliers.name)),
    db.select({ n: count() }).from(suppliers),
  ]);

  // Счётчики считаем сгруппированными запросами, а не подзапросом в
  // списке выбора: там Drizzle печатает столбцы без имени таблицы, и
  // связь между таблицами теряется
  const ids = rows.map((r) => r.id);
  const [purchaseStats, outsourceStats] = await Promise.all([
    ids.length
      ? db
          .select({
            supplierId: purchaseOrders.supplierId,
            n: count(),
            sum: sql<string>`coalesce(sum(${purchaseOrders.totalAmount}), 0)`,
          })
          .from(purchaseOrders)
          .where(inArray(purchaseOrders.supplierId, ids))
          .groupBy(purchaseOrders.supplierId)
      : Promise.resolve([]),
    ids.length
      ? db
          .select({
            supplierId: externalOrderItems.supplierId,
            n: count(),
            sum: sql<string>`coalesce(sum(${externalOrderItems.price}), 0)`,
          })
          .from(externalOrderItems)
          .where(inArray(externalOrderItems.supplierId, ids))
          .groupBy(externalOrderItems.supplierId)
      : Promise.resolve([]),
  ]);

  const purchasesOf = new Map(
    purchaseStats.map((s) => [s.supplierId, { n: Number(s.n), sum: Number(s.sum) }]),
  );
  const outsourceOf = new Map(
    outsourceStats.map((s) => [s.supplierId, { n: Number(s.n), sum: Number(s.sum) }]),
  );

  return (
    <AdminPage
      title="Подрядчики"
      subtitle={onlyActive ? "С кем работаем" : "Все, включая выключенных"}
      actions={
        <>
          <Link
            href={onlyActive ? "/admin/suppliers?all=1" : "/admin/suppliers"}
            className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            {onlyActive ? "ПОКАЗАТЬ ВСЕХ" : "ТОЛЬКО АКТИВНЫЕ"}
          </Link>
          {canCreate && (
            <Link
              href="/admin/suppliers/new"
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
            >
              <Plus className="size-3.5" aria-hidden />
              НОВЫЙ ПОДРЯДЧИК
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Всего в справочнике" value={String(total?.n ?? 0)} />
        <AdminStat label="Показано" value={String(rows.length)} />
        <AdminStat
          label="Перезаказано у них"
          value={money.format(
            [...outsourceOf.values()].reduce((s, x) => s + x.sum, 0),
          )}
          tone="brand"
        />
      </div>

      <form action="/admin/suppliers" className="mt-6 flex flex-wrap gap-2">
        {!onlyActive && <input type="hidden" name="all" value="1" />}
        <div className="relative flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={search}
            placeholder="Название, контактное лицо, телефон или почта"
            aria-label="Поиск по подрядчикам"
            className="w-full rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-ink px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-graphite"
        >
          НАЙТИ
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title="Никого не нашлось"
            text="Попробуйте другой запрос или заведите подрядчика."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                <th className="px-5 py-2.5">ПОДРЯДЧИК</th>
                <th className="px-4 py-2.5">СВЯЗЬ</th>
                <th className="px-4 py-2.5 text-right">ЗАКУПОК</th>
                <th className="px-4 py-2.5 text-right">ПЕРЕЗАКАЗОВ</th>
                <th className="px-5 py-2.5 text-right">НА СУММУ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const p = purchasesOf.get(s.id);
                const o = outsourceOf.get(s.id);
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-b border-ink/6 last:border-0 hover:bg-paper",
                      !s.isActive && "opacity-60",
                    )}
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/suppliers/${s.id}`}
                        className="flex items-center gap-1 text-ink hover:text-brand"
                      >
                        {s.name}
                        <ChevronRight className="size-3 text-ink/25" aria-hidden />
                      </Link>
                      {s.contactPerson && (
                        <span className="block text-xs text-ink/50">
                          {s.contactPerson}
                        </span>
                      )}
                      {!s.isActive && (
                        <span className="text-xs text-ink/40">не работаем</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/65">
                      {s.phone && (
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          <Phone className="size-3 text-ink/35" aria-hidden />
                          {s.phone}
                        </span>
                      )}
                      {s.email && (
                        <span className="flex items-center gap-1.5 text-xs text-ink/45">
                          <Mail className="size-3 text-ink/35" aria-hidden />
                          {s.email}
                        </span>
                      )}
                      {!s.phone && !s.email && "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {p?.n ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {o?.n ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono tabular-nums text-ink">
                      {money.format((p?.sum ?? 0) + (o?.sum ?? 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
