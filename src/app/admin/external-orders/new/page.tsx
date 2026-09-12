import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { clients, products, suppliers } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = {
  title: "Новый заказ · Админка",
  robots: { index: false, follow: false },
};

/**
 * Заведение заказа менеджера - то, ради чего вообще можно выключить
 * старый сайт: до этого заказы только показывались.
 */
export default async function NewExternalOrder({
  searchParams,
}: PageProps<"/admin/external-orders/new">) {
  if (!(await can("orders", "create"))) {
    return (
      <AdminPage title="Новый заказ">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права заводить заказы." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const rawClient = Number(Array.isArray(sp.client) ? sp.client[0] : sp.client);
  const defaultClientId =
    Number.isInteger(rawClient) && rawClient > 0 ? rawClient : undefined;

  const [counterparties, productList, supplierList] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        companyName: clients.companyName,
        phone: clients.phone,
        email: clients.email,
        address: clients.address,
      })
      .from(clients)
      .where(eq(clients.isArchived, false))
      .orderBy(asc(clients.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        basePrice: products.basePrice,
        unit: products.unit,
      })
      .from(products)
      .where(eq(products.isHidden, false))
      .orderBy(asc(products.name)),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),
  ]);

  return (
    <AdminPage
      title="Новый заказ"
      subtitle="Заказ менеджера: заказчик, состав, срок и деньги"
      actions={
        <Link
          href="/admin/external-orders"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К СПИСКУ
        </Link>
      }
    >
      <OrderForm
        counterparties={counterparties}
        productList={productList}
        suppliers={supplierList}
        defaultClientId={defaultClientId}
      />
    </AdminPage>
  );
}
