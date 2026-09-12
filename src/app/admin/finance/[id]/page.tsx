import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, asc } from "drizzle-orm";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { db } from "@/db";
import {
  ordersAccounting,
  orderExpenses,
  orderPayments,
  expensesCategories,
} from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { paymentStateOf, profitOf, SOURCE } from "@/lib/finance";
import { DeleteRow, ExpenseForm, PaymentForm } from "../FinanceForms";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Запись бухгалтерии · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export default async function AdminFinanceEntry(
  props: PageProps<"/admin/finance/[id]">,
) {
  if (!(await can("finance", "view"))) {
    return (
      <AdminPage title="Запись">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();

  const [entry] = await db
    .select()
    .from(ordersAccounting)
    .where(eq(ordersAccounting.id, Number(id)))
    .limit(1);

  if (!entry) notFound();

  const canCreate = await can("finance", "create");
  const canDelete = await can("finance", "delete");

  const [expenses, payments, categories] = await Promise.all([
    db
      .select({
        id: orderExpenses.id,
        materialName: orderExpenses.materialName,
        quantity: orderExpenses.quantity,
        unit: orderExpenses.unit,
        costPerUnit: orderExpenses.costPerUnit,
        amount: orderExpenses.amount,
        description: orderExpenses.description,
        expenseDate: orderExpenses.expenseDate,
        categoryName: expensesCategories.name,
      })
      .from(orderExpenses)
      .leftJoin(
        expensesCategories,
        eq(orderExpenses.categoryId, expensesCategories.id),
      )
      .where(eq(orderExpenses.orderAccountingId, entry.id))
      .orderBy(asc(orderExpenses.id)),

    db
      .select()
      .from(orderPayments)
      .where(eq(orderPayments.orderAccountingId, entry.id))
      .orderBy(desc(orderPayments.paymentDate)),

    db
      .select({ id: expensesCategories.id, name: expensesCategories.name })
      .from(expensesCategories)
      .orderBy(asc(expensesCategories.name)),
  ]);

  const p = profitOf({
    income: entry.income,
    expense: entry.totalExpense,
    tax: entry.taxAmount,
  });

  // Сумма строк расходов и поле total_expense в старой базе могут
  // разойтись, если запись правили в обход пересчёта. Показываем обе,
  // иначе расхождение останется незамеченным
  const expensesSum = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const mismatch = Math.abs(expensesSum - p.expense) > 0.01;

  const paidSum = payments.reduce((s, x) => s + Number(x.amount), 0);
  const st = paymentStateOf(entry.status);

  return (
    <AdminPage
      title={entry.clientName ?? "Без имени"}
      subtitle={`${SOURCE[entry.source] ?? entry.source} · запись № ${entry.id}`}
      actions={
        <>
          {entry.orderId && (
            <Link
              href={`/admin/orders/${entry.orderId}`}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
            >
              Заказ № {entry.orderId}
            </Link>
          )}
          {entry.externalOrderId && (
            <Link
              href={`/admin/external-orders/${entry.externalOrderId}`}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
            >
              Заказ менеджера № {entry.externalOrderId}
            </Link>
          )}
          <Link
            href="/admin/finance"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <ArrowLeft className="size-4" aria-hidden />
            К списку
          </Link>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Доход" value={money.format(p.income)} tone="brand" />
        <AdminStat label="Расход" value={money.format(p.expense)} />
        <AdminStat label="Налог" value={money.format(p.tax)} />
        <AdminStat
          label="Прибыль"
          value={money.format(p.profit)}
          tone={p.profit >= 0 ? "brand" : "warn"}
          hint={
            p.margin !== null ? `рентабельность ${p.margin.toFixed(1)}%` : undefined
          }
        />
      </div>

      {mismatch && (
        <p className="mt-4 rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">
          Сумма строк расходов - {money.format(expensesSum)}, а в записи стоит{" "}
          {money.format(p.expense)}. Расхождение перенесено из старой базы, где
          итог хранился отдельным полем.
        </p>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ---------- Расходы ---------- */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-ink">
            <TrendingDown className="size-4 text-ink/40" aria-hidden />
            Расходы
            <span className="font-mono text-sm font-normal text-ink/45">
              {money.format(expensesSum)}
            </span>
          </h2>

          {expenses.length === 0 ? (
            <AdminEmpty title="Расходов не заведено" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>Статья</Th>
                    <Th className="text-right">Кол-во</Th>
                    <Th className="text-right">Сумма</Th>
                    <Th className="text-right">Дата</Th>
                    {canDelete && <Th className="text-right">{""}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-ink/6 last:border-0">
                      <td className="px-4 py-3">
                        <span className="block text-ink">
                          {e.materialName ?? e.description ?? "Без названия"}
                        </span>
                        {e.categoryName && (
                          <span className="block text-xs text-ink/45">
                            {e.categoryName}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-ink/55">
                        {e.quantity
                          ? `${num.format(Number(e.quantity))} ${e.unit ?? ""}`
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {money.format(Number(e.amount))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-ink/45">
                        {e.expenseDate ? dt.format(e.expenseDate) : "-"}
                      </td>
                      {canDelete && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <DeleteRow kind="expense" cardId={entry.id} rowId={e.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canCreate && (
            <div className="mt-4">
              <ExpenseForm cardId={entry.id} categories={categories} />
            </div>
          )}
        </section>

        {/* ---------- Оплаты ---------- */}
        <aside>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-ink">
            <TrendingUp className="size-4 text-ink/40" aria-hidden />
            Оплаты
          </h2>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                  st.className,
                )}
              >
                {st.label}
              </span>
              <span className="font-mono text-lg text-ink">
                {money.format(paidSum)}
              </span>
            </div>

            {/* Остаток показываем только у неоплаченных: при статусе
                «оплачен» без записей о платежах это выглядело бы как
                противоречие - «оплачен, но должен всю сумму» */}
            {entry.status !== "paid" && p.income > 0 && paidSum < p.income && (
              <p className="mt-3 text-sm text-warn">
                Остаток к оплате: {money.format(p.income - paidSum)}
              </p>
            )}

            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">
                {entry.status === "paid"
                  ? "Отмечен оплаченным без записей о платежах - в старой базе статус проставляли вручную."
                  : "Платежей не зафиксировано."}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2 border-t border-ink/10 pt-3">
                {payments.map((x) => (
                  <li
                    key={x.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="font-mono text-xs text-ink/50">
                      {x.paymentDate ? dt.format(x.paymentDate) : "-"}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-ink">
                      {money.format(Number(x.amount))}
                      {canDelete && (
                        <DeleteRow kind="payment" cardId={entry.id} rowId={x.id} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canCreate && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <PaymentForm cardId={entry.id} />
              </div>
            )}
          </div>
        </aside>
      </div>
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
