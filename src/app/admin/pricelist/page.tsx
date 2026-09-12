import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { EyeOff } from "lucide-react";
import { db } from "@/db";
import { priceCategories, priceItems } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Прайс-лист · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

/**
 * Цена в прайсе задаётся тремя способами: фиксированная, вилка «от-до»
 * или только нижняя граница. Показываем ровно то, что заполнено, -
 * подставлять недостающую границу нельзя, это меняет смысл.
 */
function priceLabel(item: {
  priceFixed: string | null;
  priceMin: string | null;
  priceMax: string | null;
}) {
  const fixed = item.priceFixed ? Number(item.priceFixed) : null;
  const min = item.priceMin ? Number(item.priceMin) : null;
  const max = item.priceMax ? Number(item.priceMax) : null;

  if (fixed && fixed > 0) return money.format(fixed);
  if (min && max) return `${money.format(min)} - ${money.format(max)}`;
  if (min) return `от ${money.format(min)}`;
  if (max) return `до ${money.format(max)}`;
  return "по запросу";
}

export default async function AdminPriceList() {
  if (!(await can("pricelist", "view"))) {
    return (
      <AdminPage title="Прайс-лист">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть прайс." />
      </AdminPage>
    );
  }

  const [categories, items] = await Promise.all([
    db
      .select()
      .from(priceCategories)
      .orderBy(asc(priceCategories.sortOrder), asc(priceCategories.name)),
    db
      .select()
      .from(priceItems)
      .orderBy(asc(priceItems.sortOrder), asc(priceItems.name)),
  ]);

  const active = items.filter((i) => i.isActive).length;

  return (
    <AdminPage
      title="Прайс-лист"
      subtitle={`Позиций: ${items.length}, из них активных ${active} · Категорий: ${categories.length}`}
    >
      {categories.length === 0 ? (
        <AdminEmpty title="Прайс пуст" />
      ) : (
        <div className="flex flex-col gap-5">
          {categories.map((c) => {
            const own = items.filter((i) => i.categoryId === c.id);

            return (
              <section
                key={c.id}
                className={cn(
                  "overflow-hidden rounded-xl border border-ink/10 bg-bone",
                  !c.isActive && "opacity-60",
                )}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
                  <div>
                    <h2 className="font-display text-base text-ink">
                      {c.name}
                      {!c.isActive && (
                        <EyeOff
                          className="ml-2 inline size-3.5 text-ink/40"
                          aria-label="Категория скрыта"
                        />
                      )}
                    </h2>
                    {c.description && (
                      <p className="mt-0.5 text-xs text-ink/50">{c.description}</p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-ink/45">
                    {own.length} поз.
                  </span>
                </header>

                {own.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-ink/45">
                    В категории нет позиций.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                    <table className="min-w-[32rem] w-full border-collapse text-sm">
                      <tbody>
                        {own.map((i) => (
                          <tr
                            key={i.id}
                            className={cn(
                              "border-b border-ink/6 last:border-0",
                              !i.isActive && "opacity-55",
                            )}
                          >
                            <td className="px-5 py-3">
                              <span className="text-ink">{i.name}</span>
                              {!i.isActive && (
                                <EyeOff
                                  className="ml-2 inline size-3 text-ink/40"
                                  aria-label="Позиция скрыта"
                                />
                              )}
                              {i.description && (
                                <span className="block text-xs text-ink/50">
                                  {i.description}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-ink/45">
                              {i.unit ?? "шт."}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right">
                              <span className="font-mono tabular-nums text-ink">
                                {priceLabel(i)}
                              </span>
                              {i.priceNote && (
                                <span className="block text-xs text-ink/45">
                                  {i.priceNote}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-ink/45">
        Редактирование позиций и выгрузка прайса в PDF - следующим шагом.
      </p>
    </AdminPage>
  );
}
