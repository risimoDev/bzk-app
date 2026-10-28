import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, count, sql, asc, inArray } from "drizzle-orm";
import { Truck, Phone, Mail, Plus } from "lucide-react";
import { db } from "@/db";
import { purchaseOrders, purchaseOrderItems, suppliers, materials, generalExpenses } from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import { purchaseStatusOf, paymentStatusOf, RECEIVABLE, type PurchaseStatus } from "@/lib/purchases";
import { ReceiveForm } from "./ReceiveForm";
import { CancelPaymentButton, PurchasePaymentForm } from "./PaymentForm";
import { parseLocalDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Закупки · Админка",
  robots: { index: false, follow: false },
};

const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const PER_PAGE = 30;

export default async function AdminPurchases({ searchParams }: PageProps<"/admin/purchases">) {
  if (!(await can("materials", "view"))) {
    return (
      <AdminPage title="Закупки">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть закупки." />
      </AdminPage>
    );
  }

  const editable = await can("materials", "edit");
  const sp = await searchParams;
  const page = pageFrom(sp.page);

  const [orders, supplierList, [totals]] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        paymentStatus: purchaseOrders.paymentStatus,
        total: purchaseOrders.totalAmount,
        paid: purchaseOrders.paidAmount,
        expected: purchaseOrders.expectedDeliveryDate,
        createdAt: purchaseOrders.createdAt,
        supplierName: suppliers.name,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
      .limit(PER_PAGE)
      .offset(offsetOf(page, PER_PAGE)),

    db
      .select()
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),

    db
      .select({
        n: count(),
        sum: sql<string>`coalesce(sum(${purchaseOrders.totalAmount}), 0)`,
      })
      .from(purchaseOrders),
  ]);

  const items = orders.length
    ? await db
        .select({
          id: purchaseOrderItems.id,
          purchaseOrderId: purchaseOrderItems.purchaseOrderId,
          materialId: purchaseOrderItems.materialId,
          quantity: purchaseOrderItems.quantity,
          received: purchaseOrderItems.receivedQuantity,
          unitPrice: purchaseOrderItems.unitPrice,
          materialName: materials.name,
          unit: materials.unit,
        })
        .from(purchaseOrderItems)
        .leftJoin(materials, eq(purchaseOrderItems.materialId, materials.id))
        .where(
          sql`${purchaseOrderItems.purchaseOrderId} IN ${orders.map((o) => o.id)}`,
        )
    : [];

  const canCreate = await can("materials", "create");

  // Оплату отмечает тот, кто ведёт расходы: она же записывается в
  // бухгалтерию (см. markPurchasePaid)
  const [canPay, canUnpay] = await Promise.all([
    editable ? can("finance", "create") : Promise.resolve(false),
    editable ? can("finance", "delete") : Promise.resolve(false),
  ]);

  const payments = orders.length
    ? await db
        .select({
          id: generalExpenses.id,
          purchaseOrderId: generalExpenses.purchaseOrderId,
          amount: generalExpenses.amount,
          date: generalExpenses.expenseDate,
        })
        .from(generalExpenses)
        .where(inArray(generalExpenses.purchaseOrderId, orders.map((o) => o.id)))
        .orderBy(asc(generalExpenses.expenseDate), asc(generalExpenses.id))
    : [];

  return (
    <AdminPage
      title="Закупки"
      subtitle={`Заказов поставщикам: ${totals?.n ?? 0} · Поставщиков: ${supplierList.length}`}
      actions={
        canCreate && (
          <Link
            href="/admin/purchases/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВАЯ ЗАКУПКА
          </Link>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Закупок всего" value={String(totals?.n ?? 0)} />
        <AdminStat
          label="На сумму"
          value={money.format(Number(totals?.sum ?? 0))}
          tone="brand"
        />
        <AdminStat label="Активных поставщиков" value={String(supplierList.length)} />
      </div>

      {/* ---------- Закупки ---------- */}
      <h2 className="mb-3 mt-8 font-display text-lg text-ink">
        Заказы поставщикам
      </h2>

      {orders.length === 0 ? (
        <AdminEmpty
          title="Закупок пока нет"
          text="Создание заказов поставщикам появится следующим шагом. Приёмка на склад уже работает - она пополнит остатки и запишет движение."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((o) => {
            const st = purchaseStatusOf(o.status);
            const pay = paymentStatusOf(o.paymentStatus);
            const own = items.filter((i) => i.purchaseOrderId === o.id);
            const receivable =
              editable && RECEIVABLE.includes((o.status ?? "draft") as PurchaseStatus);
            const expected = parseLocalDate(o.expected);
            const ownPayments = payments.filter((p) => p.purchaseOrderId === o.id);
            const total = Number(o.total ?? 0);
            const remaining = Math.max(0, Math.round((total - Number(o.paid ?? 0)) * 100) / 100);

            return (
              <li
                key={o.id}
                className="overflow-hidden rounded-xl border border-ink/10 bg-bone"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm text-ink">{o.number}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                    <span className={cn("text-xs", pay.className)}>
                      {pay.label}
                      {o.paymentStatus === "partial" &&
                        ` · ${money.format(Number(o.paid ?? 0))} из ${money.format(total)}`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink/55">
                    <span>{o.supplierName ?? "-"}</span>
                    {expected && (
                      <span className="flex items-center gap-1 font-mono">
                        <Truck className="size-3" aria-hidden />
                        {dt.format(expected)}
                      </span>
                    )}
                    <span className="font-mono text-sm text-ink">
                      {money.format(Number(o.total ?? 0))}
                    </span>
                  </div>
                </header>

                {own.length > 0 && (
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {own.map((i) => {
                        const ordered = Number(i.quantity);
                        const got = Number(i.received ?? 0);
                        const left = ordered - got;

                        return (
                          <tr
                            key={i.id}
                            className="border-b border-ink/6 last:border-0"
                          >
                            <td className="px-5 py-3">
                              <Link
                                href={`/admin/materials/${i.materialId}`}
                                className="text-ink hover:text-brand"
                              >
                                {i.materialName ?? "-"}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                              {num.format(got)} / {num.format(ordered)}{" "}
                              <span className="text-xs text-ink/40">{i.unit}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                              {money.format(Number(i.unitPrice))}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {left > 0 && receivable ? (
                                <ReceiveForm
                                  itemId={i.id}
                                  remaining={left}
                                  unit={i.unit ?? "шт"}
                                />
                              ) : (
                                <span className="text-xs text-ok">
                                  {left <= 0 ? "принято" : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {(ownPayments.length > 0 || (canPay && o.status !== "cancelled" && remaining > 0)) && (
                  <div className="flex flex-col gap-3 border-t border-ink/10 px-5 py-3">
                    {ownPayments.length > 0 && (
                      <ul className="flex flex-col gap-1 text-xs text-ink/65">
                        {ownPayments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3">
                            <span>
                              Оплата от {dt.format(p.date)}
                            </span>
                            <span className="flex items-center gap-2 font-mono tabular-nums">
                              {money.format(Number(p.amount))}
                              {canUnpay && <CancelPaymentButton expenseId={p.id} />}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canPay && o.status !== "cancelled" && remaining > 0 && (
                      <PurchasePaymentForm purchaseOrderId={o.id} remaining={remaining} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AdminPager page={page} perPage={PER_PAGE} total={Number(totals?.n ?? 0)} basePath="/admin/purchases" params={sp} />

      {/* ---------- Поставщики ---------- */}
      <h2 className="mb-3 mt-10 font-display text-lg text-ink">Поставщики</h2>

      {supplierList.length === 0 ? (
        <AdminEmpty title="Поставщиков нет" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left">
                <Th>Поставщик</Th>
                <Th>Контактное лицо</Th>
                <Th>Связь</Th>
                <Th>Условия оплаты</Th>
              </tr>
            </thead>
            <tbody>
              {supplierList.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-ink/6 last:border-0 hover:bg-paper"
                >
                  <td className="px-4 py-3 text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-ink/60">
                    {s.contactPerson ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col gap-0.5 text-xs">
                      {s.phone && (
                        <a
                          href={`tel:${s.phone}`}
                          className="flex items-center gap-1.5 text-ink/65 hover:text-brand"
                        >
                          <Phone className="size-3" aria-hidden />
                          {s.phone}
                        </a>
                      )}
                      {s.email && (
                        <a
                          href={`mailto:${s.email}`}
                          className="flex items-center gap-1.5 text-ink/65 hover:text-brand"
                        >
                          <Mail className="size-3" aria-hidden />
                          {s.email}
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/55">
                    {s.paymentTerms ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-display text-[0.62rem] font-semibold tracking-[0.16em] text-ink/40",
        className,
      )}
    >
      {children}
    </th>
  );
}
