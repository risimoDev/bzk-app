import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, sql } from "drizzle-orm";
import { ArrowLeft, EyeOff, Hash, Plus } from "lucide-react";
import { db } from "@/db";
import {
  documentTemplates,
  documentCategories,
  counters as numberCounters,
  documents,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { counterKey, padNumber } from "@/lib/numbering";

export const metadata: Metadata = {
  title: "Шаблоны документов · Админка",
  robots: { index: false, follow: false },
};

type Field = { name: string; type: string; label?: string; required?: boolean };

/** Список полей шаблона: схема хранится JSON-ом и может быть какой угодно. */
function readFields(schema: unknown): Field[] {
  if (!schema || typeof schema !== "object") return [];
  const fields = (schema as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];

  return fields.flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    if (typeof o.name !== "string") return [];
    return [
      {
        name: o.name,
        type: typeof o.type === "string" ? o.type : "text",
        label: typeof o.label === "string" ? o.label : undefined,
        required: o.required === true,
      },
    ];
  });
}

export default async function AdminDocumentTemplates() {
  if (!(await can("documents", "view"))) {
    return (
      <AdminPage title="Шаблоны документов">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть документы." />
      </AdminPage>
    );
  }

  const [categories, templates, counters, usage] = await Promise.all([
    db.select().from(documentCategories).orderBy(asc(documentCategories.sortOrder)),
    db.select().from(documentTemplates).orderBy(asc(documentTemplates.id)),
    db.select().from(numberCounters).where(sql`starts_with(${numberCounters.key}, 'doc:')`),
    db
      .select({ templateId: documents.templateId, n: count() })
      .from(documents)
      .groupBy(documents.templateId),
  ]);

  const usedCount = new Map(usage.map((u) => [u.templateId ?? 0, Number(u.n)]));

  // Счётчик номеров заведён на пару «префикс + год» (lib/numbering-db.ts)
  const lastOf = new Map(counters.map((c) => [c.key, c.value]));

  const year = new Date().getFullYear();
  const canCreate = await can("documents", "create");

  // Шаблоны без раздела раньше не показывались вовсе: список строился
  // только по разделам. Теперь у них своя группа в конце
  const groups = [
    ...categories.map((c) => ({ id: c.id as number | null, name: c.name })),
    { id: null, name: "Без раздела" },
  ];

  return (
    <AdminPage
      title="Шаблоны документов"
      subtitle={`${templates.length} шаблонов в ${categories.length} категориях`}
      actions={
        <>
        {canCreate && (
          <Link
            href="/admin/documents/templates/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВЫЙ ШАБЛОН
          </Link>
        )}
        <Link
          href="/admin/documents"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К ДОКУМЕНТАМ
        </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map((cat) => {
          const own = templates.filter((t) => t.categoryId === cat.id);
          if (own.length === 0) return null;

          return (
            <section
              key={cat.id ?? "none"}
              className="overflow-hidden rounded-xl border border-ink/10 bg-bone"
            >
              <header className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
                <h2 className="font-display text-base text-ink">{cat.name}</h2>
                <span className="font-mono text-xs text-ink/45">{own.length} шт.</span>
              </header>

              <ul className="divide-y divide-ink/6">
                {own.map((t) => {
                  const fields = readFields(t.fieldsSchema);
                  const required = fields.filter((f) => f.required).length;
                  const used = usedCount.get(t.id) ?? 0;

                  return (
                    <li
                      key={t.id}
                      className={cn("px-5 py-3.5", !t.isActive && "opacity-55")}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <Link
                          href={`/admin/documents/templates/${t.id}`}
                          className="text-ink hover:text-brand"
                        >
                          {t.name}
                          {!t.isActive && (
                            <EyeOff
                              className="ml-2 inline size-3 text-ink/40"
                              aria-label="Шаблон отключён"
                            />
                          )}
                        </Link>
                        <span className="flex flex-wrap items-center gap-3 font-mono text-xs text-ink/45">
                          {t.isNumbered && t.numberPrefix && (
                            <span className="flex items-center gap-1">
                              <Hash className="size-3" aria-hidden />
                              {t.numberPrefix}
                              {year}-
                              {padNumber(
                                (lastOf.get(counterKey.document(t.numberPrefix.trim(), year)) ?? 0) + 1,
                                4,
                              )}
                            </span>
                          )}
                          <span>полей: {fields.length}</span>
                          {required > 0 && <span>обязательных: {required}</span>}
                          <span className={used > 0 ? "text-ink/70" : ""}>
                            выпущено: {used}
                          </span>
                        </span>
                      </div>

                      {t.description && (
                        <p className="mt-1 text-xs text-ink/50">{t.description}</p>
                      )}

                      {fields.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink/40">
                          {fields
                            .slice(0, 8)
                            .map((f) => f.label ?? f.name)
                            .join(" · ")}
                          {fields.length > 8 && ` … ещё ${fields.length - 8}`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 max-w-2xl text-xs text-ink/45">
        Реквизиты продавца раньше были прописаны в значениях по умолчанию у каждого шаблона -
        отдельной копией в счёте, акте и договоре. Теперь они берутся из{" "}
        <Link href="/admin/settings/company" className="underline underline-offset-2">
          общих реквизитов
        </Link>
         - в самих шаблонах их прописывать не нужно.
      </p>
    </AdminPage>
  );
}
