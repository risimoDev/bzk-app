import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { OfferForm } from "./OfferForm";

export const metadata: Metadata = {
  title: "Новое КП · Админка",
  robots: { index: false, follow: false },
};

export default async function NewOffer() {
  if (!(await can("documents", "create"))) {
    return (
      <AdminPage title="Новое предложение">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить КП." />
      </AdminPage>
    );
  }

  const counterparties = await db
    .select({ id: clients.id, name: clients.name, companyName: clients.companyName })
    .from(clients)
    .where(eq(clients.isArchived, false))
    .orderBy(asc(clients.name));

  return (
    <AdminPage
      title="Новое предложение"
      subtitle="Номер присвоится сам. Принятое КП превращается в заказ одной кнопкой"
      actions={
        <Link
          href="/admin/offers"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К СПИСКУ
        </Link>
      }
    >
      <OfferForm counterparties={counterparties} />
    </AdminPage>
  );
}
