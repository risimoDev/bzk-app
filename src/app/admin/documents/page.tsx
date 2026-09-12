import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, count, sql } from "drizzle-orm";
import { FileText, Paperclip, Eye, Plus } from "lucide-react";
import { db } from "@/db";
import { documents, documentCategories, documentTemplates, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import { docStatus, docType } from "@/lib/documents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Документы · Админка",
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
  year: "numeric",
});

const PER_PAGE = 50;

export default async function AdminDocuments({
  searchParams,
}: PageProps<"/admin/documents">) {
  if (!(await can("documents", "view"))) {
    return (
      <AdminPage title="Документы">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть документы." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const categoryFilter = Number(sp.category) || 0;
  const page = pageFrom(sp.page);

  const [categories, templates] = await Promise.all([
    db.select().from(documentCategories).orderBy(documentCategories.sortOrder),
    db
      .select({
        id: documentTemplates.id,
        name: documentTemplates.name,
        slug: documentTemplates.slug,
        prefix: documentTemplates.numberPrefix,
        categoryId: documentTemplates.categoryId,
        isActive: documentTemplates.isActive,
      })
      .from(documentTemplates)
      .orderBy(documentTemplates.categoryId, documentTemplates.id),
  ]);

  const rows = await db
    .select({
      id: documents.id,
      number: documents.documentNumber,
      title: documents.title,
      status: documents.status,
      docType: documents.docType,
      amount: documents.amount,
      documentDate: documents.documentDate,
      categoryId: documents.categoryId,
      templateId: documents.templateId,
      views: documents.viewsCount,
      filePath: documents.filePath,
      clientName: users.name,
      clientCompany: users.companyName,
    })
    .from(documents)
    .leftJoin(users, eq(documents.userId, users.id))
    // Отбор по разделу - в запросе, а не в коде: иначе листание и фильтр
    // работали бы по разным наборам строк
    .where(categoryFilter ? eq(documents.categoryId, categoryFilter) : undefined)
    .orderBy(desc(documents.documentDate), desc(documents.id))
    .limit(PER_PAGE)
    .offset(offsetOf(page, PER_PAGE));

  // Считаем по всем документам, а не по отфильтрованной выборке:
  // счётчик у фильтра должен показывать, сколько там найдётся
  const perCategory = await db
    .select({ categoryId: documents.categoryId, n: count() })
    .from(documents)
    .groupBy(documents.categoryId);

  const countOf = new Map(perCategory.map((r) => [r.categoryId ?? 0, Number(r.n)]));

  const visible = rows;
  const allCount = perCategory.reduce((sum, r) => sum + Number(r.n), 0);
  const found = categoryFilter ? (countOf.get(categoryFilter) ?? 0) : allCount;

  // Итоги - по всем документам, а не по видимой странице
  const [agg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${documents.amount}), 0)`,
      signed: sql<number>`count(*) filter (where ${documents.status} in ('signed', 'approved'))::int`,
    })
    .from(documents);
  const totalAmount = Number(agg?.amount ?? 0);
  const signed = Number(agg?.signed ?? 0);
  const templateName = new Map(templates.map((t) => [t.id, t.name]));

  const canCreate = await can("documents", "create");

  return (
    <AdminPage
      title="Документы"
      subtitle="Счета, акты, накладные и внутренние формы"
      actions={
        <>
          <Link
            href="/admin/documents/templates"
            className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            ШАБЛОНЫ · {templates.length}
          </Link>
          {canCreate && (
            <Link
              href="/admin/documents/new"
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
            >
              <Plus className="size-3.5" aria-hidden />
              НОВЫЙ ДОКУМЕНТ
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Всего документов" value={String(allCount)} />
        <AdminStat
          label="На сумму"
          value={money.format(totalAmount)}
          hint="по заполненному полю «сумма»"
        />
        <AdminStat label="Согласовано и подписано" value={String(signed)} tone="brand" />
        <AdminStat
          label="Шаблонов"
          value={String(templates.filter((t) => t.isActive).length)}
          hint={`всего заведено ${templates.length}`}
        />
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        <FilterChip href="/admin/documents" active={categoryFilter === 0}>
          Все · {allCount}
        </FilterChip>
        {categories.map((c) => (
          <FilterChip
            key={c.id}
            href={`/admin/documents?category=${c.id}`}
            active={categoryFilter === c.id}
          >
            {c.name} · {countOf.get(c.id) ?? 0}
          </FilterChip>
        ))}
      </nav>

      {visible.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title="Документов нет"
            text={
              categoryFilter
                ? "В этой категории пока пусто - попробуйте снять фильтр."
                : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[54rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                <th className="px-5 py-2.5">НОМЕР</th>
                <th className="px-4 py-2.5">ДОКУМЕНТ</th>
                <th className="px-4 py-2.5">КОНТРАГЕНТ</th>
                <th className="px-4 py-2.5">ДАТА</th>
                <th className="px-4 py-2.5 text-right">СУММА</th>
                <th className="px-5 py-2.5">СТАТУС</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = docStatus(r.status);
                const template = r.templateId ? templateName.get(r.templateId) : null;
                return (
                  <tr key={r.id} className="border-b border-ink/6 last:border-0 hover:bg-paper">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link
                        href={`/admin/documents/${r.id}`}
                        className="font-mono text-ink hover:text-brand"
                      >
                        {r.number ?? `#${r.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{r.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-ink/45">
                        <FileText className="size-3" aria-hidden />
                        {/* Название шаблона у большинства записей дословно
                            совпадает с заголовком - второй раз не повторяем */}
                        {template && template !== r.title && <span>{template} ·</span>}
                        <span>{docType(r.docType)}</span>
                        {r.filePath && (
                          <Paperclip className="size-3" aria-label="Есть вложенный файл" />
                        )}
                        {(r.views ?? 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="size-3" aria-hidden />
                            {r.views}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {r.clientCompany || r.clientName || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                      {r.documentDate ? dt.format(new Date(`${r.documentDate}T00:00:00`)) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {r.amount ? money.format(Number(r.amount)) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          st.className,
                        )}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager page={page} perPage={PER_PAGE} total={found} basePath="/admin/documents" params={sp} />

      <p className="mt-6 text-xs text-ink/45">
        Печатные формы, привязанные к заказу, открываются с карточки заказа: счёт с
        QR-кодом и универсальный передаточный документ.
      </p>
    </AdminPage>
  );
}

function FilterChip({
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
        "rounded-lg border px-3.5 py-1.5 text-xs",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-ink/12 text-ink/60 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
