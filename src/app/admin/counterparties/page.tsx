import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Archive, ChevronRight, Search, UserCheck } from "lucide-react";
import { db } from "@/db";
import { clients, externalOrders, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { CounterpartyForm } from "./CounterpartyForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Контрагенты · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const PER_PAGE = 40;

/**
 * Контрагенты - заказчики без аккаунта на сайте.
 *
 * Раздел «Клиенты» рядом показывает аккаунты; здесь те, кого менеджер
 * завёл сам. Один и тот же человек может быть и там и там - тогда
 * контрагент привязан к аккаунту, и его заказы видны в кабинете.
 */
export default async function AdminCounterparties({
  searchParams,
}: PageProps<"/admin/counterparties">) {
  if (!(await can("users", "view"))) {
    return (
      <AdminPage title="Контрагенты">
        <AdminEmpty
          title="Нет доступа"
          text="У вашей роли нет права смотреть контрагентов."
        />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const search = one(sp.q).trim().slice(0, 100);
  const showArchived = one(sp.archived) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const conditions: SQL[] = [eq(clients.isArchived, showArchived)];
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(clients.name, like),
      ilike(clients.companyName, like),
      ilike(clients.phone, like),
      ilike(clients.email, like),
      ilike(clients.inn, like),
    );
    if (cond) conditions.push(cond);
  }
  const where = and(...conditions);

  const canEdit = await can("users", "edit");

  const [rows, [totals], [orphans]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        companyName: clients.companyName,
        phone: clients.phone,
        email: clients.email,
        userId: clients.userId,
        accountName: users.name,
      })
      .from(clients)
      .leftJoin(users, eq(users.id, clients.userId))
      .where(where)
      .orderBy(asc(clients.name))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ n: count() }).from(clients).where(where),
    db
      .select({ n: count() })
      .from(externalOrders)
      .where(sql`${externalOrders.clientId} is null`),
  ]);

  // Заказы контрагентов считаем отдельным сгруппированным запросом:
  // подзапрос в списке выбора Drizzle печатает без имени таблицы, и
  // условие сравнивает столбец сам с собой - счётчик выходит общий
  const stats = rows.length
    ? await db
        .select({
          clientId: externalOrders.clientId,
          n: count(),
          sum: sql<string>`coalesce(sum(${externalOrders.totalPrice}), 0)`,
        })
        .from(externalOrders)
        .where(
          inArray(
            externalOrders.clientId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(externalOrders.clientId)
    : [];

  const statOf = new Map(
    stats.map((s) => [s.clientId, { n: Number(s.n), sum: Number(s.sum) }]),
  );

  const found = Number(totals?.n ?? 0);
  const pages = Math.max(1, Math.ceil(found / PER_PAGE));

  const href = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | null> = {
      q: search,
      archived: showArchived ? "1" : null,
      page: 1,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/admin/counterparties?${qs}` : "/admin/counterparties";
  };

  return (
    <AdminPage
      title="Контрагенты"
      subtitle={
        showArchived ? "Архив" : "Заказчики, заведённые менеджером - с аккаунтом и без"
      }
      actions={
        <Link
          href={href({ archived: showArchived ? null : "1" })}
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <Archive className="size-3.5" aria-hidden />
          {showArchived ? "В РАБОТЕ" : "АРХИВ"}
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Контрагентов" value={String(found)} />
        <AdminStat
          label="С аккаунтом на сайте"
          value={String(rows.filter((r) => r.userId).length)}
          hint="на этой странице"
        />
        <AdminStat
          label="Заказов без контрагента"
          value={String(Number(orphans?.n ?? 0))}
          tone={Number(orphans?.n ?? 0) > 0 ? "warn" : "plain"}
          hint="прицепить можно в карточке заказа"
        />
      </div>

      {canEdit && !showArchived && (
        <div className="mt-6">
          <CounterpartyForm />
        </div>
      )}

      <form action="/admin/counterparties" className="mt-6 flex flex-wrap gap-2">
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <div className="relative flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={search}
            placeholder="Имя, организация, телефон, почта или ИНН"
            aria-label="Поиск по контрагентам"
            className="w-full rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-ink px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-graphite"
        >
          НАЙТИ
        </button>
        {search && (
          <Link
            href={href({ q: null })}
            className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink"
          >
            СБРОСИТЬ
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title={search ? "Ничего не нашлось" : "Контрагентов пока нет"}
            text={
              search
                ? "Попробуйте другой запрос."
                : "Первый появится, когда менеджер заведёт заказ на нового заказчика."
            }
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                <th className="px-5 py-2.5">КОНТРАГЕНТ</th>
                <th className="px-4 py-2.5">СВЯЗЬ</th>
                <th className="px-4 py-2.5">АККАУНТ</th>
                <th className="px-4 py-2.5 text-right">ЗАКАЗОВ</th>
                <th className="px-5 py-2.5 text-right">НА СУММУ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = statOf.get(c.id);
                return (
                  <tr key={c.id} className="border-b border-ink/6 last:border-0 hover:bg-paper">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/counterparties/${c.id}`}
                        className="flex items-center gap-1 text-ink hover:text-brand"
                      >
                        {c.name}
                        <ChevronRight className="size-3 text-ink/25" aria-hidden />
                      </Link>
                      {c.companyName && (
                        <span className="block text-xs text-ink/50">{c.companyName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/65">
                      {c.phone && (
                        <span className="block font-mono text-xs">{c.phone}</span>
                      )}
                      {c.email && (
                        <span className="block text-xs text-ink/45">{c.email}</span>
                      )}
                      {!c.phone && !c.email && "-"}
                    </td>
                    <td className="px-4 py-3">
                      {c.userId ? (
                        <Link
                          href={`/admin/clients/${c.userId}`}
                          className="inline-flex items-center gap-1.5 text-xs text-ok hover:underline"
                        >
                          <UserCheck className="size-3.5" aria-hidden />
                          {c.accountName}
                        </Link>
                      ) : (
                        <span className="text-xs text-ink/35">нет</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {s?.n ?? 0}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-5 py-3 text-right font-mono tabular-nums",
                        s ? "text-ink" : "text-ink/35",
                      )}
                    >
                      {money.format(s?.sum ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex flex-wrap items-center gap-2" aria-label="Страницы">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={href({ page: p })}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-xs",
                p === page
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-ink/12 text-ink/55 hover:border-ink/30 hover:text-ink",
              )}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </AdminPage>
  );
}
