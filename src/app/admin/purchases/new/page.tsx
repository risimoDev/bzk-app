import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { materials, suppliers } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { PurchaseForm } from "./PurchaseForm";

export const metadata: Metadata = {
  title: "Новая закупка · Админка",
  robots: { index: false, follow: false },
};

export default async function NewPurchase() {
  if (!(await can("materials", "create"))) {
    return (
      <AdminPage title="Новая закупка">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить закупки." />
      </AdminPage>
    );
  }

  const [supplierList, materialList] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        id: materials.id,
        name: materials.name,
        unit: materials.unit,
        costPerUnit: materials.costPerUnit,
      })
      .from(materials)
      .orderBy(asc(materials.name)),
  ]);

  return (
    <AdminPage
      title="Новая закупка"
      subtitle="Подрядчик, материалы и срок поставки"
      actions={
        <Link
          href="/admin/purchases"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К ЗАКУПКАМ
        </Link>
      }
    >
      {supplierList.length === 0 ? (
        <AdminEmpty
          title="Нет подрядчиков"
          text="Справочник подрядчиков пуст - закупку не на кого оформить."
        />
      ) : (
        <PurchaseForm suppliers={supplierList} materialList={materialList} />
      )}
    </AdminPage>
  );
}
