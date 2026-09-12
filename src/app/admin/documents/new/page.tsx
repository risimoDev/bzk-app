import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { documentCategories, documentTemplates, orders, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { DocumentForm } from "./DocumentForm";

export const metadata: Metadata = {
  title: "Новый документ · Админка",
  robots: { index: false, follow: false },
};

export default async function NewDocument() {
  if (!(await can("documents", "create"))) {
    return (
      <AdminPage title="Новый документ">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить документы." />
      </AdminPage>
    );
  }

  const [templates, categories, clientList, orderList] = await Promise.all([
    db
      .select({
        id: documentTemplates.id,
        name: documentTemplates.name,
        prefix: documentTemplates.numberPrefix,
        categoryId: documentTemplates.categoryId,
        // Тело и схема полей нужны форме: по схеме она рисует поля, а
        // тело показывает в подсказке, какие плейсхолдеры заполнит
        contentTemplate: documentTemplates.contentTemplate,
        fieldsSchema: documentTemplates.fieldsSchema,
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.isActive, true))
      .orderBy(asc(documentTemplates.name)),
    db
      .select({ id: documentCategories.id, name: documentCategories.name })
      .from(documentCategories)
      .orderBy(asc(documentCategories.sortOrder)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        companyName: users.companyName,
        inn: users.inn,
      })
      .from(users)
      .where(and(eq(users.role, "user"), eq(users.isBlocked, false)))
      .orderBy(asc(users.name))
      .limit(200),
    // Заказов с сайта пока единицы, но список всё равно ограничиваем:
    // выпадающий список на тысячу строк никому не поможет
    db
      .select({ id: orders.id, clientName: users.name })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .orderBy(desc(orders.createdAt))
      .limit(100),
  ]);

  return (
    <AdminPage
      title="Новый документ"
      subtitle="Номер присвоится по шаблону, если оставить поле пустым"
      actions={
        <Link
          href="/admin/documents"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К СПИСКУ
        </Link>
      }
    >
      <DocumentForm
        templates={templates}
        categories={categories}
        clients={clientList}
        orders={orderList}
      />
    </AdminPage>
  );
}
