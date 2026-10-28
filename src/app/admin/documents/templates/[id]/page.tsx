import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { documentCategories, documentTemplates, documents } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { safeDocumentHtml } from "@/lib/documents";
import { TemplateForm } from "../TemplateForm";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Шаблон документа · Админка",
  robots: { index: false, follow: false },
};

export default async function DocumentTemplatePage(
  props: PageProps<"/admin/documents/templates/[id]">,
) {
  if (!(await can("documents", "view"))) {
    return (
      <AdminPage title="Шаблон документа">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть документы." />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  const templateId = parseId(id);
  if (templateId === null) notFound();

  const [[template], categories, [usage]] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.id, templateId)).limit(1),
    db
      .select({ id: documentCategories.id, name: documentCategories.name })
      .from(documentCategories)
      .orderBy(asc(documentCategories.sortOrder), asc(documentCategories.name)),
    db.select({ n: count() }).from(documents).where(eq(documents.templateId, templateId)),
  ]);

  if (!template) notFound();

  const editable = await can("documents", "edit");

  return (
    <AdminPage
      title={template.name}
      subtitle={`Выпущено документов: ${usage?.n ?? 0}`}
      actions={
        <Link
          href="/admin/documents/templates"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К шаблонам
        </Link>
      }
    >
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
          {!editable && (
            <p className="mb-5 rounded-lg bg-paper px-4 py-3 text-sm text-ink/60">
              У вашей роли нет права менять шаблоны - поля только для чтения.
            </p>
          )}
          <TemplateForm template={template} categories={categories} readOnly={!editable} />
        </section>

        <section className="rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
          <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">ПРЕВЬЮ</h2>
          <p className="mt-1 text-xs text-ink/50">
            Так шаблон попадёт в документ: после белого списка тегов, с плейсхолдерами как есть.
          </p>

          {template.contentTemplate ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10 bg-white p-6 text-sm text-black">
              <div dangerouslySetInnerHTML={{ __html: safeDocumentHtml(template.contentTemplate) }} />
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-paper px-4 py-6 text-center text-sm text-ink/50">
              Разметка пустая - документ по шаблону будет без текста.
            </p>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
