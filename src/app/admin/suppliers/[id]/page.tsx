import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { externalOrderItems, externalOrders, purchaseOrders, suppliers } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { purchaseStatusOf } from "@/lib/purchases";
import { DeleteSupplierButton, SupplierForm } from "../SupplierForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Подрядчик · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export default async function AdminSupplier({
  params,
}: PageProps<"/admin/suppliers/[id]">) {
  if (!(await can("materials", "view"))) {
    return (
      <AdminPage title="Подрядчик">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) notFound();

  const [row] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!row) notFound();

  const canEdit = await can("materials", "edit");
  const canDelete = await can("materials", "delete");

  const [purchases, outsourced] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        total: purchaseOrders.totalAmount,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, supplierId))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(50),
    db
      .select({
        id: externalOrderItems.id,
        orderId: externalOrderItems.externalOrderId,
        itemName: externalOrderItems.itemName,
        price: externalOrderItems.price,
        expense: externalOrderItems.expenseAmount,
        clientName: externalOrders.clientName,
        createdAt: externalOrders.createdAt,
      })
      .from(externalOrderItems)
      .innerJoin(externalOrders, eq(externalOrders.id, externalOrderItems.externalOrderId))
      .where(eq(externalOrderItems.supplierId, supplierId))
      .orderBy(desc(externalOrders.createdAt))
      .limit(50),
  ]);

  const outsourcedSum = outsourced.reduce((s, i) => s + Number(i.expense), 0);
  const purchaseSum = purchases.reduce((s, p) => s + Number(p.total ?? 0), 0);

  return (
    <AdminPage
      title={row.name}
      subtitle={row.contactPerson ?? undefined}
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
      {!row.isActive && (
        <p className="mb-5 rounded-xl border border-warn/30 bg-warn/8 px-5 py-3 text-sm text-ink/75">
          С этим подрядчиком не работаем - в закупке и при перезаказе он не
          предлагается.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Закупок" value={String(purchases.length)} hint={money.format(purchaseSum)} />
        <AdminStat label="Перезаказанных позиций" value={String(outsourced.length)} />
        <AdminStat
          label="Заплатили за перезаказ"
          value={money.format(outsourcedSum)}
          tone="brand"
          hint="по вписанной себестоимости позиций"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex flex-col gap-5">
          <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <header className="border-b border-ink/10 px-5 py-3">
              <h2 className="font-display text-base text-ink">Перезаказы</h2>
            </header>
            {outsourced.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink/50">
                Позиций, отмеченных перезаказом у этого подрядчика, пока нет.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                <table className="min-w-[34rem] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                      <th className="px-5 py-2.5">ЗАКАЗ</th>
                      <th className="px-4 py-2.5">ПОЗИЦИЯ</th>
                      <th className="px-4 py-2.5 text-right">ПРОДАЛИ</th>
                      <th className="px-5 py-2.5 text-right">ЗАПЛАТИЛИ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outsourced.map((i) => (
                      <tr key={i.id} className="border-b border-ink/6 last:border-0">
                        <td className="whitespace-nowrap px-5 py-3">
                          <Link
                            href={`/admin/external-orders/${i.orderId}`}
                            className="font-mono text-ink hover:text-brand"
                          >
                            {i.orderId}
                          </Link>
                          <span className="block text-xs text-ink/45">{i.clientName}</span>
                        </td>
                        <td className="px-4 py-3 text-ink/70">{i.itemName ?? "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                          {money.format(Number(i.price))}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right font-mono tabular-nums text-ink/60">
                          {money.format(Number(i.expense))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <header className="border-b border-ink/10 px-5 py-3">
              <h2 className="font-display text-base text-ink">Закупки</h2>
            </header>
            {purchases.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink/50">Закупок у него не было.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[34rem] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                      <th className="px-5 py-2.5">НОМЕР</th>
                      <th className="px-4 py-2.5">СОЗДАНА</th>
                      <th className="px-4 py-2.5">СОСТОЯНИЕ</th>
                      <th className="px-5 py-2.5 text-right">СУММА</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => {
                      const st = purchaseStatusOf(p.status);
                      return (
                        <tr key={p.id} className="border-b border-ink/6 last:border-0">
                          <td className="whitespace-nowrap px-5 py-3 font-mono text-ink">
                            {p.number}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                            {p.createdAt ? dt.format(p.createdAt) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                                st.className,
                              )}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-mono tabular-nums text-ink">
                            {money.format(Number(p.total ?? 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="mb-4 font-display text-base text-ink">Карточка</h2>
            {canEdit ? (
              <SupplierForm
                value={{
                  id: row.id,
                  name: row.name,
                  contactPerson: row.contactPerson,
                  phone: row.phone,
                  email: row.email,
                  website: row.website,
                  address: row.address,
                  paymentTerms: row.paymentTerms,
                  deliveryTerms: row.deliveryTerms,
                  notes: row.notes,
                  isActive: row.isActive,
                }}
              />
            ) : (
              <dl className="flex flex-col gap-2 text-sm text-ink/70">
                {row.phone && <dd>{row.phone}</dd>}
                {row.email && <dd>{row.email}</dd>}
                {row.address && <dd>{row.address}</dd>}
                {row.notes && <dd className="text-ink/55">{row.notes}</dd>}
              </dl>
            )}
          </div>

          {canDelete && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                УДАЛЕНИЕ
              </h2>
              <p className="mt-2 mb-3 text-sm text-ink/55">
                Удалить можно только того, за кем нет ни закупок, ни перезаказов.
              </p>
              <DeleteSupplierButton id={row.id} />
            </div>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}
