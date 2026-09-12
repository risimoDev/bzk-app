import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, ilike, and, count, type SQL } from "drizzle-orm";
import { Search, EyeOff, Star, Plus } from "lucide-react";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Товары · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const PER_PAGE = 40;

export default async function AdminProducts(props: PageProps<"/admin/products">) {
  if (!(await can("products", "view"))) {
    return (
      <AdminPage title="Товары">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть каталог." />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const query = one(sp.q).trim();
  const categoryId = Number(one(sp.category)) || 0;
  const visibility = one(sp.show); // "" | "hidden" | "popular"
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const filters: SQL[] = [];
  if (query) filters.push(ilike(products.name, `%${query}%`));
  if (categoryId) filters.push(eq(products.categoryId, categoryId));
  if (visibility === "hidden") filters.push(eq(products.isHidden, true));
  if (visibility === "popular") filters.push(eq(products.isPopular, true));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total], cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        basePrice: products.basePrice,
        unit: products.unit,
        minQuantity: products.minQuantity,
        isHidden: products.isHidden,
        isPopular: products.isPopular,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(desc(products.isPopular), asc(products.name))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ n: count() }).from(products).where(where),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);

  const found = total?.n ?? 0;
  const pages = Math.max(1, Math.ceil(found / PER_PAGE));

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (categoryId) p.set("category", String(categoryId));
    if (visibility) p.set("show", visibility);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/products?${s}` : "/admin/products";
  };

  const canCreate = await can("products", "create");

  return (
    <AdminPage
      title="Товары"
      subtitle={`Найдено: ${found}`}
      actions={
        canCreate && (
          <Link
            href="/admin/products/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВЫЙ ТОВАР
          </Link>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/products" className="flex gap-2">
          {categoryId > 0 && (
            <input type="hidden" name="category" value={categoryId} />
          )}
          {visibility && <input type="hidden" name="show" value={visibility} />}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/30"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Название товара"
              aria-label="Поиск по товарам"
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
          <Chip href={link({ category: "", show: "", page: "" })} active={!categoryId && !visibility}>
            Все
          </Chip>
          {cats.map((c) => (
            <Chip
              key={c.id}
              href={link({ category: String(c.id), page: "" })}
              active={categoryId === c.id}
            >
              {c.name}
            </Chip>
          ))}
          <Chip href={link({ show: "popular", category: "", page: "" })} active={visibility === "popular"}>
            Популярные
          </Chip>
          <Chip href={link({ show: "hidden", category: "", page: "" })} active={visibility === "hidden"}>
            Скрытые
          </Chip>
        </nav>
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <AdminEmpty
            title="Ничего не найдено"
            text="Попробуйте изменить фильтр или поисковый запрос."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <Th>Название</Th>
                  <Th>Категория</Th>
                  <Th className="text-right">Мин. тираж</Th>
                  <Th className="text-right">Базовая цена</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-ink/6 last:border-0 hover:bg-paper",
                      p.isHidden && "opacity-55",
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="text-ink hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      {p.isPopular && (
                        <Star
                          className="ml-2 inline size-3.5 fill-warn text-warn"
                          aria-label="Популярный"
                        />
                      )}
                      {p.isHidden && (
                        <EyeOff
                          className="ml-2 inline size-3.5 text-ink/40"
                          aria-label="Скрыт с витрины"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/60">
                      {p.categoryName ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                      {p.minQuantity} {p.unit ?? "шт."}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {money.format(Number(p.basePrice))}
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
