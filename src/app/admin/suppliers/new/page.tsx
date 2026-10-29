import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { isDadataEnabled } from "@/lib/dadata";
import { SupplierForm } from "../SupplierForm";

export const metadata: Metadata = {
  title: "Новый подрядчик · Админка",
  robots: { index: false, follow: false },
};

export default async function NewSupplier() {
  if (!(await can("materials", "create"))) {
    return (
      <AdminPage title="Новый подрядчик">
        <AdminEmpty
          title="Нет доступа"
          text="У вашей роли нет права заводить подрядчиков."
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Новый подрядчик"
      subtitle="У него закупают материалы и ему же перезаказывают позиции"
      actions={
        <Link
          href="/admin/suppliers"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К СПИСКУ
        </Link>
      }
    >
      <section className="max-w-3xl rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
        <SupplierForm innLookup={isDadataEnabled()} />
      </section>
    </AdminPage>
  );
}
