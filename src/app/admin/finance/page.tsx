import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, gte, sql, count, type SQL } from "drizzle-orm";
import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import { db } from "@/db";
import { ordersAccounting, generalExpenses, expensesCategories } from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import { DeleteRow, GeneralExpenseForm } from "./FinanceForms";
import { paymentStateOf, profitOf, periodRange, PERIODS, SOURCE } from "@/lib/finance";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Бухгалтерия · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const moneyExact = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const PER_PAGE = 50;
const GENERAL_PER_PAGE = 30;

export default async function AdminFinance(props: PageProps<"/admin/finance">) {
  if (!(await can("finance", "view"))) {
    return (
      <AdminPage title="Бухгалтерия">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть финансы." />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const periodKey = one(sp.period) || "3";
  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  const range = period.months > 0 ? periodRange(period.months) : null;

  const periodFilter: SQL | undefined = range
    ? gte(ordersAccounting.createdAt, range.from)
    : undefined;

  const page = pageFrom(sp.page);
  const generalPage = pageFrom(sp.gpage);
  const generalFilter = range ? gte(generalExpenses.expenseDate, range.from) : undefined;

  const [rows, [totals], general, categories, [generalTotals]] = await Promise.all([
    db
      .select({
        id: ordersAccounting.id,
        source: ordersAccounting.source,
        orderId: ordersAccounting.orderId,
        clientName: ordersAccounting.clientName,
        income: ordersAccounting.income,
        expense: ordersAccounting.totalExpense,
        tax: ordersAccounting.taxAmount,
        status: ordersAccounting.status,
        createdAt: ordersAccounting.createdAt,
      })
      .from(ordersAccounting)
      .where(periodFilter)
      .orderBy(desc(ordersAccounting.createdAt), desc(ordersAccounting.id))
      .limit(PER_PAGE)
      .offset(offsetOf(page, PER_PAGE)),

    db
      .select({
        n: count(),
        income: sql<string>`coalesce(sum(${ordersAccounting.income}), 0)`,
        expense: sql<string>`coalesce(sum(${ordersAccounting.totalExpense}), 0)`,
        tax: sql<string>`coalesce(sum(${ordersAccounting.taxAmount}), 0)`,
      })
      .from(ordersAccounting)
      .where(periodFilter),

    db
      .select({
        id: generalExpenses.id,
        amount: generalExpenses.amount,
        description: generalExpenses.description,
        expenseDate: generalExpenses.expenseDate,
        categoryName: expensesCategories.name,
      })
      .from(generalExpenses)
      .leftJoin(
        expensesCategories,
        eq(generalExpenses.categoryId, expensesCategories.id),
      )
      .where(generalFilter)
      .orderBy(desc(generalExpenses.expenseDate), desc(generalExpenses.id))
      .limit(GENERAL_PER_PAGE)
      .offset(offsetOf(generalPage, GENERAL_PER_PAGE)),

    db.select().from(expensesCategories),

    // Сумма общих расходов - за весь период, а не по видимой странице.
    // Раньше она складывалась из первых 30 строк, и чистая прибыль
    // завышалась, как только расходов становилось больше
    db
      .select({
        n: count(),
        sum: sql<string>`coalesce(sum(${generalExpenses.amount}), 0)`,
      })
      .from(generalExpenses)
      .where(generalFilter),
  ]);

  const orderTotals = profitOf({
    income: totals?.income ?? 0,
    expense: totals?.expense ?? 0,
    tax: totals?.tax ?? 0,
  });

  // Общие расходы не привязаны к заказам, поэтому вычитаются из
  // прибыли отдельно - иначе картина по периоду выходит завышенной
  const generalSum = Number(generalTotals?.sum ?? 0);
  const netProfit = orderTotals.profit - generalSum;

  const canCreate = await can("finance", "create");
  const canDelete = await can("finance", "delete");

  const link = (key: string) =>
    key === "3" ? "/admin/finance" : `/admin/finance?period=${key}`;

  return (
    <AdminPage
      title="Бухгалтерия"
      subtitle={`Записей за период: ${totals?.n ?? 0}`}
      actions={
        <nav aria-label="Период" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={link(p.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors",
                p.key === period.key
                  ? "bg-ink text-bone"
                  : "border border-ink/12 text-ink/60 hover:border-brand/40 hover:text-brand",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat
          label="Выручка"
          value={money.format(orderTotals.income)}
          tone="brand"
        />
        <AdminStat
          label="Расходы по заказам"
          value={money.format(orderTotals.expense)}
        />
        <AdminStat
          label="Общие расходы"
          value={money.format(generalSum)}
          hint="аренда, связь и прочее"
        />
        <AdminStat
          label="Прибыль"
          value={money.format(netProfit)}
          tone={netProfit >= 0 ? "brand" : "warn"}
          hint={
            orderTotals.margin !== null
              ? `рентабельность ${orderTotals.margin.toFixed(1)}% по заказам`
              : undefined
          }
        />
      </div>

      {/* ---------- Заказы ---------- */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 font-display text-lg text-ink">
        <Receipt className="size-4 text-ink/40" aria-hidden />
        Заказы
      </h2>

      {rows.length === 0 ? (
        <AdminEmpty
          title="За период записей нет"
          text="Выберите другой период или заведите заказ."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left">
                <Th>Клиент</Th>
                <Th>Источник</Th>
                <Th>Оплата</Th>
                <Th className="text-right">Доход</Th>
                <Th className="text-right">Расход</Th>
                <Th className="text-right">Прибыль</Th>
                <Th className="text-right">Дата</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = profitOf(r);
                const st = paymentStateOf(r.status);

                return (
                  <tr
                    key={r.id}
                    className="border-b border-ink/6 last:border-0 hover:bg-paper"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/finance/${r.id}`}
                        className="text-ink hover:text-brand"
                      >
                        {r.clientName ?? "Без имени"}
                      </Link>
                      {r.orderId && (
                        <Link
                          href={`/admin/orders/${r.orderId}`}
                          className="ml-2 font-mono text-xs text-ink/40 hover:text-brand"
                        >
                          №{r.orderId}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink/55">
                      {SOURCE[r.source] ?? r.source}
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
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {moneyExact.format(p.income)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                      {moneyExact.format(p.expense)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums",
                        p.profit >= 0 ? "text-ok" : "text-danger",
                      )}
                    >
                      {p.profit >= 0 ? (
                        <TrendingUp className="mr-1 inline size-3" aria-hidden />
                      ) : (
                        <TrendingDown className="mr-1 inline size-3" aria-hidden />
                      )}
                      {moneyExact.format(p.profit)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-ink/45">
                      {r.createdAt ? dt.format(r.createdAt) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Общие расходы ---------- */}
      <AdminPager page={page} perPage={PER_PAGE} total={Number(totals?.n ?? 0)} basePath="/admin/finance" params={sp} />

      <h2 className="mb-3 mt-10 flex items-center gap-2 font-display text-lg text-ink">
        <Wallet className="size-4 text-ink/40" aria-hidden />
        Общие расходы
        <span className="font-mono text-sm font-normal text-ink/45">
          {money.format(generalSum)}
        </span>
      </h2>

      {general.length === 0 ? (
        <AdminEmpty title="За период общих расходов нет" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left">
                <Th>Дата</Th>
                <Th>Категория</Th>
                <Th>Описание</Th>
                <Th className="text-right">Сумма</Th>
                {canDelete && <Th className="text-right">{""}</Th>}
              </tr>
            </thead>
            <tbody>
              {general.map((g) => (
                <tr key={g.id} className="border-b border-ink/6 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                    {g.expenseDate ? dt.format(g.expenseDate) : "-"}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {g.categoryName ?? "Без категории"}
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {g.description ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                    {moneyExact.format(Number(g.amount))}
                  </td>
                  {canDelete && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <DeleteRow kind="general" rowId={g.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager page={generalPage} perPage={GENERAL_PER_PAGE} total={Number(generalTotals?.n ?? 0)} basePath="/admin/finance" params={sp} param="gpage" />

      {canCreate && (
        <div className="mt-4">
          <GeneralExpenseForm categories={categories} />
        </div>
      )}

      <p className="mt-4 text-xs text-ink/45">
        Категорий расходов заведено: {categories.length}. Расходы и платежи по
        конкретному заказу вносятся в его записи.
      </p>
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
