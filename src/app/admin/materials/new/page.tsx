import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { MaterialForm } from "../MaterialForm";

export const metadata: Metadata = {
  title: "Новый материал · Админка",
  robots: { index: false, follow: false },
};

export default async function NewMaterial() {
  if (!(await can("materials", "create"))) {
    return (
      <AdminPage title="Новый материал">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить материалы." />
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Новый материал"
      subtitle="Остаток заведётся нулевым - приход записывается движением"
      actions={
        <Link
          href="/admin/materials"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К СКЛАДУ
        </Link>
      }
    >
      <section className="max-w-3xl rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
        <MaterialForm />
      </section>
    </AdminPage>
  );
}
