import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ilike, or, and, count, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { ORDER_STATUS, statusOf, type OrderStatus } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";
import { isKeyOf } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Заказы · Админка",
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

const PER_PAGE = 30;

export default async function AdminOrders(props: PageProps<"/admin/orders">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Заказы">
        <AdminEmpty
          title="Нет доступа"
          text="У вашей роли нет права просматривать заказы."
        />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const status = one(sp.status);
  const query = one(sp.q).trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const filters: SQL[] = [];
  if (status && isKeyOf(ORDER_STATUS, status)) {
    filters.push(eq(orders.status, status as OrderStatus));
  }
  if (query) {
    const like = `%${query}%`;
    // Длинное число - это не номер заказа, а, скорее, телефон: в integer
    // оно не влезет, и сравнение с id уронило бы запрос
    const orderId = parseId(query);
    const byId = orderId === null ? undefined : eq(orders.id, orderId);
    const cond = or(ilike(users.name, like), ilike(users.email, like), byId);
    if (cond) filters.push(cond);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.totalPrice,
        createdAt: orders.createdAt,
        readyDate: orders.readyDate,
        isUrgent: orders.isUrgent,
        isNew: orders.isNew,
        clientName: users.name,
        clientEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db
      .select({ n: count() })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(where),
  ]);

  const found = total?.n ?? 0;
  const pages = Math.max(1, Math.ceil(found / PER_PAGE));

  const link = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <AdminPage title="Заказы" subtitle={`Найдено: ${found}`}>
      {/* ---------- Фильтры ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/orders" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/30"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Номер, имя или почта"
              aria-label="Поиск по заказам"
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

        <nav aria-label="Фильтр по статусу" className="flex flex-wrap gap-1.5">
          <Chip href={link({ status: "", page: "" })} active={!status}>
            Все
          </Chip>
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((key) => (
            <Chip
              key={key}
              href={link({ status: key, page: "" })}
              active={status === key}
            >
              {ORDER_STATUS[key].label}
            </Chip>
          ))}
        </nav>
      </div>

      {/* ---------- Таблица ---------- */}
      <div className="mt-5">
        {rows.length === 0 ? (
          <AdminEmpty
            title="Ничего не найдено"
            text={
              query || status
                ? "Попробуйте изменить фильтр или поисковый запрос."
                : "Заказов пока нет."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <Th>№</Th>
                  <Th>Клиент</Th>
                  <Th>Статус</Th>
                  <Th>Создан</Th>
                  <Th>Готовность</Th>
                  <Th className="text-right">Сумма</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const st = statusOf(o.status);
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-ink/6 last:border-0 hover:bg-paper"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono text-ink hover:text-brand"
                        >
                          {o.id}
                        </Link>
                        {o.isNew && o.status !== "cancelled" && (
                          <span className="ml-2 rounded bg-brand/12 px-1.5 py-0.5 font-display text-[0.58rem] tracking-wider text-brand">
                            НОВЫЙ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-ink/85">
                          {o.clientName ?? "-"}
                        </span>
                        <span className="block text-xs text-ink/45">
                          {o.clientEmail ?? ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                            st.className,
                          )}
                        >
                          {st.label}
                        </span>
                        {o.isUrgent && (
                          <span className="ml-1.5 rounded bg-danger/12 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-danger">
                            СРОЧНО
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-ink/60">
                        {o.createdAt ? dt.format(o.createdAt) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-ink/60">
                        {o.readyDate ? dt.format(o.readyDate) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {money.format(Number(o.total))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Страницы ---------- */}
      {pages > 1 && (
        <nav
          aria-label="Страницы"
          className="mt-5 flex items-center justify-center gap-2"
        >
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
