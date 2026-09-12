import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = {
  title: "Новый товар · Админка",
  robots: { index: false, follow: false },
};

export default async function NewProduct() {
  if (!(await can("products", "create"))) {
    return (
      <AdminPage title="Новый товар">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить товары." />
      </AdminPage>
    );
  }

  const categoryList = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));

  return (
    <AdminPage
      title="Новый товар"
      subtitle="Цены по тиражам задаются после того, как товар заведён"
      actions={
        <Link
          href="/admin/products"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К списку
        </Link>
      }
    >
      <section className="max-w-3xl rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
        <ProductForm categoryList={categoryList} readOnly={false} />
      </section>
    </AdminPage>
  );
}
