import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, sql, count, eq } from "drizzle-orm";
import { TrendingUp, Users, Package, Repeat, Layers } from "lucide-react";
import { db } from "@/db";
import { ordersAccounting, externalOrders } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  profitOf,
  marginOf,
  monthLabel,
  lastMonths,
  barHeight,
  REPORT_TZ,
  type MonthPoint,
} from "@/lib/analytics";
import { openDebt } from "@/lib/order-money-db";
import { OrderStructureTable } from "@/components/admin/OrderStructure";
import { ITEM_CATEGORY_ORDER as ORDER, buildStructure, itemCategoryOf } from "@/lib/order-structure";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Аналитика · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const MONTHS_SHOWN = 12;

export default async function AdminAnalytics() {
  if (!(await can("finance", "view"))) {
    return (
      <AdminPage title="Аналитика">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть финансы." />
      </AdminPage>
    );
  }

  const months = lastMonths(MONTHS_SHOWN);

  // Месяц - по часовому поясу мастерской, а не сервера: иначе заказ,
  // оформленный 1-го числа рано утром, уезжал в прошлый месяц.
  // orders_accounting.created_at - timestamptz, поэтому одного
  // `at time zone` достаточно: он даёт местное время. Двойное
  // `at time zone 'UTC' at time zone …` нужно только колонкам без пояса
  const localCreated = sql`(${ordersAccounting.createdAt} at time zone ${sql.raw(`'${REPORT_TZ}'`)})`;
  const monthKey = sql<string>`to_char(${localCreated}, 'YYYY-MM')`;

  // Отменённые заказы и карточки без заказа в выручку не входят: денег по
  // ним не будет, а раньше они раздували и выручку, и средний чек
  const active = eq(ordersAccounting.isCancelled, false);

  // Заказы менеджера за те же 12 месяцев, что и столбики выше, без отменённых.
  // Дата - по часовому поясу мастерской, как у месяцев
  const extLocalCreated = sql`(${externalOrders.createdAt} at time zone ${sql.raw(`'${REPORT_TZ}'`)})`;
  const extPeriod = and(
    sql`${externalOrders.productionStatus} <> 'cancelled'`,
    sql`${extLocalCreated} >= ${`${months[0]}-01`}::timestamp`,
  );

  const [byMonth, totals, byClient, byItem, repeatRows, readyTimes, debt, byCategory, categoryTotals] =
    await Promise.all([
    db
      .select({
        month: monthKey,
        income: sql<string>`coalesce(sum(${ordersAccounting.income}), 0)`,
        expense: sql<string>`coalesce(sum(${ordersAccounting.totalExpense}), 0)`,
        tax: sql<string>`coalesce(sum(${ordersAccounting.taxAmount}), 0)`,
        orders: count(),
      })
      .from(ordersAccounting)
      .where(and(active, sql`${localCreated} >= ${`${months[0]}-01`}::timestamp`))
      .groupBy(monthKey),
    db
      .select({
        income: sql<string>`coalesce(sum(${ordersAccounting.income}), 0)`,
        expense: sql<string>`coalesce(sum(${ordersAccounting.totalExpense}), 0)`,
        tax: sql<string>`coalesce(sum(${ordersAccounting.taxAmount}), 0)`,
        orders: count(),
      })
      .from(ordersAccounting)
      .where(active),
    db
      .select({
        client: ordersAccounting.clientName,
        income: sql<string>`coalesce(sum(${ordersAccounting.income}), 0)`,
        expense: sql<string>`coalesce(sum(${ordersAccounting.totalExpense}), 0)`,
        tax: sql<string>`coalesce(sum(${ordersAccounting.taxAmount}), 0)`,
        orders: count(),
      })
      .from(ordersAccounting)
      .where(active)
      .groupBy(ordersAccounting.clientName)
      .orderBy(desc(sql`sum(${ordersAccounting.income})`))
      .limit(12),
    // Что именно продаём - по позициям обоих видов заказов. Название -
    // из каталога, а у позиций без товара - то, что вписал менеджер: у
    // товарных позиций item_name пуст, и раньше они сливались в одно
    // «без названия». Отменённые заказы не считаем
    db.execute<{
      name: string;
      revenue: string;
      expense: string;
      quantity: string;
      times: string;
    }>(sql`
      select name,
             sum(price) as revenue,
             sum(expense) as expense,
             sum(quantity) as quantity,
             count(distinct order_key) as times
      from (
        select coalesce(p.name, i.item_name, 'без названия') as name,
               i.price, i.expense_amount as expense, i.quantity,
               'e' || i.external_order_id as order_key
        from external_order_items i
        join external_orders o on o.id = i.external_order_id
        left join products p on p.id = i.product_id
        where o.production_status <> 'cancelled'
        union all
        select coalesce(p.name, i.product_name, i.item_name, 'без названия'),
               i.price, 0, i.quantity,
               's' || i.order_id
        from order_items i
        join orders o on o.id = i.order_id
        left join products p on p.id = i.product_id
        where o.status is distinct from 'cancelled'
      ) items
      group by name
      order by sum(price) desc
      limit 12
    `),
    // Повторные клиенты - по человеку, а не по строке имени: сайтовый
    // клиент - аккаунт, заказчик менеджера - контрагент (а если контрагент
    // связан с аккаунтом - тот же аккаунт). У старых заказов без
    // контрагента остаётся только имя
    db.execute<{ client: string; orders: string; revenue: string }>(sql`
      select min(name) as client, count(*) as orders, sum(total) as revenue
      from (
        select coalesce('u' || c.user_id, 'c' || o.client_id, 'n' || lower(trim(o.client_name))) as who,
               coalesce(c.name, o.client_name) as name,
               o.total_price as total
        from external_orders o
        left join clients c on c.id = o.client_id
        where o.production_status <> 'cancelled'
        union all
        select 'u' || o.user_id, coalesce(u.name, 'Клиент сайта'), o.total_price
        from orders o
        left join users u on u.id = o.user_id
        where o.status is distinct from 'cancelled'
      ) x
      group by who
    `),
    // Сколько дней от оформления до назначенной готовности
    db
      .select({
        days: sql<string>`extract(day from ${externalOrders.estimatedReadyDate} - ${externalOrders.createdAt})`,
      })
      .from(externalOrders)
      .where(sql`${externalOrders.estimatedReadyDate} is not null`),
    openDebt(),
    // Выручка и расход по видам работ: позиции заказов менеджера. У сайтовых
    // заказов вида работ нет, поэтому они сюда не входят
    db.execute<{ category: string; revenue: string; expense: string; items: string }>(sql`
      select i.item_category as category,
             sum(i.price) as revenue,
             sum(i.expense_amount) as expense,
             count(*) as items
      from external_order_items i
      join external_orders o on o.id = i.external_order_id
      where o.production_status <> 'cancelled'
        and (o.created_at at time zone ${sql.raw(`'${REPORT_TZ}'`)}) >= ${`${months[0]}-01`}::timestamp
      group by i.item_category
    `),
    // Итог тех же заказов: разница с суммой позиций - корректировки и заказы
    // без позиций (описанные текстом), они идут отдельной строкой
    db
      .select({
        total: sql<string>`coalesce(sum(${externalOrders.totalPrice}), 0)`,
        orders: count(),
      })
      .from(externalOrders)
      .where(extPeriod),
  ]);

  const monthMap = new Map(byMonth.map((r) => [r.month, r]));
  const points: MonthPoint[] = months.map((m) => {
    const row = monthMap.get(m);
    const income = Number(row?.income ?? 0);
    const expense = Number(row?.expense ?? 0);
    const tax = Number(row?.tax ?? 0);
    return {
      month: m,
      income,
      expense,
      tax,
      profit: profitOf(income, expense, tax),
      orders: Number(row?.orders ?? 0),
    };
  });

  const maxIncome = Math.max(...points.map((p) => p.income), 0);

  const t = totals[0];
  const totalIncome = Number(t?.income ?? 0);
  const totalExpense = Number(t?.expense ?? 0);
  const totalTax = Number(t?.tax ?? 0);
  const totalProfit = profitOf(totalIncome, totalExpense, totalTax);
  const totalOrders = Number(t?.orders ?? 0);

  const clientsRows = repeatRows.rows;
  const repeat = clientsRows.filter((r) => Number(r.orders) > 1);
  const repeatShare =
    clientsRows.length > 0 ? Math.round((repeat.length / clientsRows.length) * 100) : 0;

  const categoryStructure = buildStructure(
    byCategory.rows.map((r) => ({
      category: itemCategoryOf(r.category),
      count: Number(r.items),
      revenue: Number(r.revenue),
      expense: Number(r.expense),
    })),
    categoryTotals[0]?.total ?? 0,
  );
  // Порядок строк - как в форме позиции, а не как отдал group by
  categoryStructure.rows.sort(
    (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category),
  );

  const days = readyTimes
    .map((r) => Number(r.days))
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgDays =
    days.length > 0 ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null;

  return (
    <AdminPage
      title="Аналитика"
      subtitle="Считается по бухгалтерским карточкам заказов"
      actions={
        <Link
          href="/admin/finance"
          className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          БУХГАЛТЕРИЯ
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat
          label="Выручка за всё время"
          value={money.format(totalIncome)}
          hint={`заказов: ${totalOrders}`}
        />
        <AdminStat
          label="Прибыль"
          value={money.format(totalProfit)}
          tone={totalProfit > 0 ? "brand" : "warn"}
          hint={`рентабельность ${marginOf(totalIncome, totalProfit)}%`}
        />
        <AdminStat
          label="Средний чек"
          value={money.format(totalOrders > 0 ? totalIncome / totalOrders : 0)}
          hint={debt.debt > 0 ? `ждём оплаты ${money.format(debt.debt)}` : undefined}
        />
        <AdminStat
          label="Повторных клиентов"
          value={`${repeat.length} из ${clientsRows.length}`}
          hint={`${repeatShare}% заказывали больше одного раза`}
          tone={repeatShare >= 30 ? "brand" : "plain"}
        />
      </div>

      {/* ------------------------------------------------ по месяцам */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
          <TrendingUp className="size-5 text-brand" aria-hidden />
          Выручка по месяцам
        </h2>

        {maxIncome === 0 ? (
          <div className="mt-4">
            <AdminEmpty title="За последний год записей нет" />
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-end gap-2 overflow-x-auto rounded-xl border border-ink/10 bg-bone px-5 pb-3 pt-6">
              {points.map((p) => (
                <div
                  key={p.month}
                  className="flex min-w-14 flex-1 flex-col items-center gap-1.5"
                >
                  <span className="font-mono text-[0.6rem] tabular-nums text-ink/45">
                    {p.income > 0 ? Math.round(p.income / 1000) + "к" : ""}
                  </span>
                  <div
                    className="flex h-40 w-full items-end"
                    role="img"
                    aria-label={`${monthLabel(p.month)}: выручка ${money.format(p.income)}, прибыль ${money.format(p.profit)}`}
                  >
                    <div className="relative w-full">
                      <div
                        className="w-full rounded-t bg-ink/12"
                        style={{ height: `${barHeight(p.income, maxIncome) * 1.6}px` }}
                      />
                      {/* Прибыль - заливка внутри столбца выручки */}
                      <div
                        className={cn(
                          "absolute bottom-0 w-full rounded-t",
                          p.profit >= 0 ? "bg-brand" : "bg-danger",
                        )}
                        style={{
                          height: `${barHeight(Math.abs(p.profit), maxIncome) * 1.6}px`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-[0.6rem] text-ink/40">
                    {monthLabel(p.month)}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink/45">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-ink/12" aria-hidden />
                выручка
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-brand" aria-hidden />
                прибыль после расходов и налога
              </span>
              {avgDays !== null && (
                <span>средний срок до готовности: {avgDays} дн.</span>
              )}
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                    <th className="px-5 py-2.5">МЕСЯЦ</th>
                    <th className="px-4 py-2.5 text-right">ЗАКАЗОВ</th>
                    <th className="px-4 py-2.5 text-right">ВЫРУЧКА</th>
                    <th className="px-4 py-2.5 text-right">РАСХОДЫ</th>
                    <th className="px-4 py-2.5 text-right">НАЛОГ</th>
                    <th className="px-5 py-2.5 text-right">ПРИБЫЛЬ</th>
                  </tr>
                </thead>
                <tbody>
                  {points
                    .filter((p) => p.orders > 0)
                    .map((p) => (
                      <tr key={p.month} className="border-b border-ink/6 last:border-0">
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink">
                          {monthLabel(p.month)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink/55">
                          {p.orders}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                          {money.format(p.income)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink/55">
                          {money.format(p.expense)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink/55">
                          {money.format(p.tax)}
                        </td>
                        <td
                          className={cn(
                            "px-5 py-2.5 text-right font-mono tabular-nums",
                            p.profit >= 0 ? "text-ink" : "text-danger",
                          )}
                        >
                          {money.format(p.profit)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------ структура по видам работ */}
      {categoryStructure.rows.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
            <Layers className="size-5 text-brand" aria-hidden />
            Структура заказов менеджера
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-ink/45">
            За последние {MONTHS_SHOWN} месяцев, без отменённых. Расход - себестоимость
            позиций; общие расходы и налог сюда не входят, поэтому маржа выше прибыли в
            таблице по месяцам. Заказы с сайта не делятся по видам работ и не учтены.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <OrderStructureTable
              structure={categoryStructure}
              adjustmentLabel="Скидки и наценки заказов, заказы без позиций"
              totalLabel="Итого по заказам менеджера"
            />
          </div>
        </section>
      )}

      {/* -------------------------------------------------- клиенты */}
      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
            <Users className="size-5 text-brand" aria-hidden />
            Клиенты по выручке
          </h2>

          {byClient.length === 0 ? (
            <div className="mt-4">
              <AdminEmpty title="Данных нет" />
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {byClient.map((c) => {
                const income = Number(c.income);
                const profit = profitOf(income, Number(c.expense), Number(c.tax));
                return (
                  <li
                    key={c.client ?? "-"}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                  >
                    <span>
                      <span className="text-ink">{c.client ?? "Без имени"}</span>
                      <span className="block text-xs text-ink/45">
                        заказов: {Number(c.orders)} · рентабельность{" "}
                        {marginOf(income, profit)}%
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono tabular-nums text-ink">
                        {money.format(income)}
                      </span>
                      <span
                        className={cn(
                          "block font-mono text-xs tabular-nums",
                          profit >= 0 ? "text-ink/45" : "text-danger",
                        )}
                      >
                        {money.format(profit)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
            <Package className="size-5 text-brand" aria-hidden />
            Что продаём
          </h2>

          {byItem.rows.length === 0 ? (
            <div className="mt-4">
              <AdminEmpty title="Позиций нет" />
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {byItem.rows.map((i) => {
                const revenue = Number(i.revenue);
                const expense = Number(i.expense);
                const margin = revenue > 0 ? marginOf(revenue, revenue - expense) : 0;
                return (
                  <li
                    key={i.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                  >
                    <span>
                      <span className="text-ink">{i.name}</span>
                      <span className="block text-xs text-ink/45">
                        в {Number(i.times)} заказах · {Number(i.quantity)} шт
                        {expense > 0 && ` · наценка ${margin}%`}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-ink">
                      {money.format(revenue)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* --------------------------------------------- повторные */}
      {repeat.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
            <Repeat className="size-5 text-brand" aria-hidden />
            Возвращаются
          </h2>

          <ul className="mt-4 flex flex-wrap gap-2">
            {repeat
              .sort((a, b) => Number(b.orders) - Number(a.orders))
              .slice(0, 20)
              .map((r, idx) => (
                <li
                  key={`${r.client}-${idx}`}
                  className="rounded-lg border border-ink/10 bg-bone px-4 py-2 text-sm"
                >
                  <span className="text-ink">{r.client}</span>
                  <span className="ml-2 font-mono text-xs text-ink/45">
                    {Number(r.orders)} заказов · {money.format(Number(r.revenue))}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <p className="mt-8 max-w-3xl text-xs text-ink/45">
        Выручка и прибыль берутся из бухгалтерских карточек: только там доход,
        расход и налог лежат вместе по сайтовым и внешним заказам. Складывать
        суммы из самих заказов нельзя - себестоимости и налога в них нет.
      </p>
      <p className="mt-2 max-w-3xl text-xs text-ink/45">
        Прибыль здесь считается по заказам: доход минус расходы по ним и налог.
        В{" "}
        <Link href="/admin/finance" className="underline underline-offset-2">
          бухгалтерии
        </Link>{" "}
        итог меньше - там дополнительно вычитаются общие расходы фирмы, которые
        к отдельному заказу не привязать.
      </p>
    </AdminPage>
  );
}
