import type { Metadata } from "next";
import { asc, count, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  documentCategories,
  documents,
  expensesCategories,
  products,
  productionStages,
  productionOrderStages,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  AddRow,
  CategoryRow,
  DocumentCategoryRow,
  ExpenseCategoryRow,
} from "./CatalogForms";
import { StageRow } from "./StageForms";

export const metadata: Metadata = {
  title: "Справочники · Админка",
  robots: { index: false, follow: false },
};

/**
 * Короткие списки, на которые ссылается всё остальное.
 *
 * До этого их правили прямо в базе: категорию товара нельзя было
 * завести, не открыв psql.
 */
export default async function AdminCatalogs() {
  const canProducts = await can("products", "view");
  const canFinance = await can("finance", "view");
  const canDocuments = await can("documents", "view");
  const canStages = await can("kanban", "view");

  if (!canProducts && !canFinance && !canDocuments && !canStages) {
    return (
      <AdminPage title="Справочники">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет прав ни на один справочник." />
      </AdminPage>
    );
  }

  const canDeleteCategory = await can("products", "delete");
  const canEditProducts = await can("products", "edit");
  const canEditFinance = await can("finance", "edit");
  const canEditDocuments = await can("documents", "edit");
  // Этапы - каркас доски производства: править их может только тот, у
  // кого есть права на настройки, а видеть - всякий, кто работает с доской
  const canEditStages = await can("settings", "edit");

  const [productCats, expenseCats, docCats, productCounts, docCounts, stages, stageUsage] =
    await Promise.all([
      canProducts
        ? db
            .select({ id: categories.id, name: categories.name })
            .from(categories)
            .orderBy(asc(categories.name))
        : Promise.resolve([]),
      canFinance
        ? db
            .select({
              id: expensesCategories.id,
              name: expensesCategories.name,
              description: expensesCategories.description,
            })
            .from(expensesCategories)
            .orderBy(asc(expensesCategories.name))
        : Promise.resolve([]),
      canDocuments
        ? db
            .select({
              id: documentCategories.id,
              name: documentCategories.name,
              sortOrder: documentCategories.sortOrder,
              isActive: documentCategories.isActive,
            })
            .from(documentCategories)
            .orderBy(asc(documentCategories.sortOrder), asc(documentCategories.name))
        : Promise.resolve([]),
      // Счётчики отдельным сгруппированным запросом: подзапрос в списке
      // выбора Drizzle печатает без имени таблицы, и связь теряется
      canProducts
        ? db
            .select({ categoryId: products.categoryId, n: count() })
            .from(products)
            .where(sql`${products.categoryId} is not null`)
            .groupBy(products.categoryId)
        : Promise.resolve([]),
      canDocuments
        ? db
            .select({ categoryId: documents.categoryId, n: count() })
            .from(documents)
            .where(sql`${documents.categoryId} is not null`)
            .groupBy(documents.categoryId)
        : Promise.resolve([]),
      canStages
        ? db
            .select({
              id: productionStages.id,
              name: productionStages.name,
              description: productionStages.description,
              defaultDurationHours: productionStages.defaultDurationHours,
              sortOrder: productionStages.sortOrder,
              isActive: productionStages.isActive,
            })
            .from(productionStages)
            .orderBy(asc(productionStages.sortOrder), asc(productionStages.id))
        : Promise.resolve([]),
      canStages
        ? db
            .select({ stageId: productionOrderStages.stageId, n: count() })
            .from(productionOrderStages)
            .groupBy(productionOrderStages.stageId)
        : Promise.resolve([]),
    ]);

  const productsIn = new Map(productCounts.map((r) => [r.categoryId, Number(r.n)]));
  const docsIn = new Map(docCounts.map((r) => [r.categoryId, Number(r.n)]));
  const stageUsed = new Map(stageUsage.map((r) => [r.stageId, Number(r.n)]));

  return (
    <AdminPage
      title="Справочники"
      subtitle="Категории товаров, статьи расходов, разделы документов и этапы производства"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {canProducts && (
          <Section
            title="Категории товаров"
            hint={`Всего: ${productCats.length}. По ним фильтруется каталог.`}
          >
            {productCats.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink/50">Пока пусто.</p>
            ) : (
              productCats.map((c) => (
                <div key={c.id}>
                  {canEditProducts ? (
                    <CategoryRow value={c} canDelete={canDeleteCategory} />
                  ) : (
                    <ReadRow name={c.name} note={`товаров: ${productsIn.get(c.id) ?? 0}`} />
                  )}
                </div>
              ))
            )}
            {canEditProducts && (
              <AddRow label="Новая категория">
                <CategoryRow canDelete={false} />
              </AddRow>
            )}
          </Section>
        )}

        {canFinance && (
          <Section
            title="Статьи расходов"
            hint={`Всего: ${expenseCats.length}. Проставляются в расходах.`}
          >
            {expenseCats.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink/50">Пока пусто.</p>
            ) : (
              expenseCats.map((c) => (
                <div key={c.id}>
                  {canEditFinance ? (
                    <ExpenseCategoryRow value={c} />
                  ) : (
                    <ReadRow name={c.name} note={c.description ?? undefined} />
                  )}
                </div>
              ))
            )}
            {canEditFinance && (
              <AddRow label="Новая статья">
                <ExpenseCategoryRow />
              </AddRow>
            )}
          </Section>
        )}

        {canDocuments && (
          <Section
            title="Разделы документов"
            hint={`Всего: ${docCats.length}. По ним раскладываются документы и шаблоны.`}
          >
            {docCats.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink/50">Пока пусто.</p>
            ) : (
              docCats.map((c) => (
                <div key={c.id}>
                  {canEditDocuments ? (
                    <DocumentCategoryRow value={c} />
                  ) : (
                    <ReadRow name={c.name} note={`документов: ${docsIn.get(c.id) ?? 0}`} />
                  )}
                </div>
              ))
            )}
            {canEditDocuments && (
              <AddRow label="Новый раздел">
                <DocumentCategoryRow />
              </AddRow>
            )}
          </Section>
        )}

        {canStages && (
          <Section
            title="Этапы производства"
            hint="Порядок - цепочка на доске производства. Пройденный заказами этап не удаляется, его выключают."
          >
            {stages.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink/50">Пока пусто.</p>
            ) : (
              stages.map((st) => (
                <div key={st.id}>
                  {canEditStages ? (
                    <StageRow value={{ ...st, used: stageUsed.get(st.id) ?? 0 }} />
                  ) : (
                    <ReadRow
                      name={`${st.sortOrder ?? 0}. ${st.name}`}
                      note={st.isActive === false ? "выключен" : `${Number(st.defaultDurationHours ?? 0)} ч`}
                    />
                  )}
                </div>
              ))
            )}
            {canEditStages && (
              <AddRow label="Новый этап">
                <StageRow />
              </AddRow>
            )}
          </Section>
        )}
      </div>

      <p className="mt-6 text-xs text-ink/45">
        Шаблоны документов правятся в разделе «Документы» → «Шаблоны»: у них
        своя разметка и схема полей.
      </p>
    </AdminPage>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
      <header className="border-b border-ink/10 px-4 py-3">
        <h2 className="font-display text-base text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-ink/45">{hint}</p>
      </header>
      {children}
    </section>
  );
}

function ReadRow({ name, note }: { name: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/6 px-4 py-2.5 last:border-0">
      <span className="text-sm text-ink">{name}</span>
      {note && <span className="text-xs text-ink/45">{note}</span>}
    </div>
  );
}
