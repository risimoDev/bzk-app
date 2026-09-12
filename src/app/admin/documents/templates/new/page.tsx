import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { documentCategories } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { TemplateForm } from "../TemplateForm";

export const metadata: Metadata = {
  title: "Новый шаблон · Админка",
  robots: { index: false, follow: false },
};

export default async function NewDocumentTemplate() {
  if (!(await can("documents", "create"))) {
    return (
      <AdminPage title="Новый шаблон">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить шаблоны." />
      </AdminPage>
    );
  }

  const categories = await db
    .select({ id: documentCategories.id, name: documentCategories.name })
    .from(documentCategories)
    .orderBy(asc(documentCategories.sortOrder), asc(documentCategories.name));

  return (
    <AdminPage
      title="Новый шаблон"
      subtitle="После сохранения откроется карточка с превью"
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
      <section className="max-w-4xl rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
        <TemplateForm categories={categories} readOnly={false} />
      </section>
    </AdminPage>
  );
}
