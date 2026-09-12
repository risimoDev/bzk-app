import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ilike, or, and, count, sql, type SQL } from "drizzle-orm";
import { Search, Ban, Building2, Wand2 } from "lucide-react";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Клиенты · Админка",
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
  year: "2-digit",
});

const PER_PAGE = 40;

export default async function AdminClients(props: PageProps<"/admin/clients">) {
  if (!(await can("users", "view"))) {
    return (
      <AdminPage title="Клиенты">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть клиентов." />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const query = one(sp.q).trim();
  const filter = one(sp.filter); // "" | "corporate" | "blocked" | "staff"
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const filters: SQL[] = [];
  if (query) {
    const like = `%${query}%`;
    const cond = or(
      ilike(users.name, like),
      ilike(users.email, like),
      ilike(users.phone, like),
      ilike(users.companyName, like),
    );
    if (cond) filters.push(cond);
  }
  if (filter === "corporate") filters.push(eq(users.isCorporate, true));
  if (filter === "blocked") filters.push(eq(users.isBlocked, true));
  if (filter === "staff") {
    const cond = or(eq(users.role, "admin"), eq(users.role, "manager"));
    if (cond) filters.push(cond);
  }
  const where = filters.length ? and(...filters) : undefined;

  // Заказы клиента считаем подзапросом: отдельный запрос на каждую
  // строку списка - это N+1, на сотне клиентов заметно
  const stats = db
    .select({
      userId: orders.userId,
      n: count().as("n"),
      sum: sql<string>`coalesce(sum(${orders.totalPrice}), 0)`.as("sum"),
    })
    .from(orders)
    .groupBy(orders.userId)
    .as("stats");

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        companyName: users.companyName,
        isCorporate: users.isCorporate,
        isBlocked: users.isBlocked,
        canUseEditor: users.canUseEditor,
        role: users.role,
        createdAt: users.createdAt,
        orderCount: stats.n,
        orderSum: stats.sum,
      })
      .from(users)
      .leftJoin(stats, eq(stats.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ n: count() }).from(users).where(where),
  ]);

  const found = total?.n ?? 0;
  const pages = Math.max(1, Math.ceil(found / PER_PAGE));

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (filter) p.set("filter", filter);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/clients?${s}` : "/admin/clients";
  };

  return (
    <AdminPage title="Клиенты" subtitle={`Найдено: ${found}`}>
      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/clients" className="flex gap-2">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/30"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Имя, почта, телефон, компания"
              aria-label="Поиск по клиентам"
              className="w-72 rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
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
          <Chip href={link({ filter: "", page: "" })} active={!filter}>
            Все
          </Chip>
          <Chip href={link({ filter: "corporate", page: "" })} active={filter === "corporate"}>
            Юрлица
          </Chip>
          <Chip href={link({ filter: "staff", page: "" })} active={filter === "staff"}>
            Сотрудники
          </Chip>
          <Chip href={link({ filter: "blocked", page: "" })} active={filter === "blocked"}>
            Заблокированные
          </Chip>
        </nav>
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <AdminEmpty title="Ничего не найдено" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <Th>Клиент</Th>
                  <Th>Контакты</Th>
                  <Th className="text-right">Заказов</Th>
                  <Th className="text-right">На сумму</Th>
                  <Th className="text-right">С нами с</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-ink/6 last:border-0 hover:bg-paper",
                      u.isBlocked && "opacity-55",
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clients/${u.id}`}
                        className="text-ink hover:text-brand"
                      >
                        {u.name}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {u.companyName && (
                          <span className="flex items-center gap-1 text-xs text-ink/50">
                            <Building2 className="size-3" aria-hidden />
                            {u.companyName}
                          </span>
                        )}
                        {u.role !== "user" && (
                          <span className="rounded bg-navy/10 px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider text-navy">
                            {u.role === "admin" ? "АДМИН" : "МЕНЕДЖЕР"}
                          </span>
                        )}
                        {u.canUseEditor && (
                          <span
                            className="flex items-center gap-1 rounded bg-brand/12 px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider text-brand"
                            title="Доступен редактор открыток"
                          >
                            <Wand2 className="size-2.5" aria-hidden />
                            РЕДАКТОР
                          </span>
                        )}
                        {u.isBlocked && (
                          <span className="flex items-center gap-1 rounded bg-danger/12 px-1.5 py-0.5 font-display text-[0.55rem] tracking-wider text-danger">
                            <Ban className="size-2.5" aria-hidden />
                            БЛОК
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-xs text-ink/60">{u.email}</span>
                      {u.phone && (
                        <span className="block font-mono text-xs text-ink/45">
                          {u.phone}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {u.orderCount ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {money.format(Number(u.orderSum ?? 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-ink/50">
                      {u.createdAt ? dt.format(u.createdAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Страницы" className="mt-5 flex items-center justify-center gap-2">
          {page > 1 && (
            <Chip href={link({ page: String(page - 1) })} active={false}>
              Назад
            </Chip>
          )}
          <span className="font-mono text-sm text-ink/50">
            {page} / {pages}
          </span>
          {page < pages && (
            <Chip href={link({ page: String(page + 1) })} active={false}>
              Вперёд
            </Chip>
          )}
        </nav>
      )}
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
