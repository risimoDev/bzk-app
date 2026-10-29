import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, count, sql, and, or, ilike, inArray, type SQL } from "drizzle-orm";
import { ChevronRight, Plus, Search } from "lucide-react";
import { db } from "@/db";
import { externalOrders, externalOrderItems, orderPayments, ordersAccounting } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  externalPaymentStatus,
  externalProductionStatus,
  EXTERNAL_PAYMENT_STATUS,
  EXTERNAL_PRODUCTION_STATUS,
  isExternalClosed,
  isExternalLate,
  type ExternalPaymentStatus,
  type ExternalProductionStatus,
} from "@/lib/external-orders";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Внешние заказы · Админка",
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

const PER_PAGE = 30;

/**
 * Заказы, оформленные менеджером.
 *
 * Их в базе на два порядка больше, чем сайтовых, - это основной поток
 * работы агентства. У заказа два независимых состояния: оплачен ли он и
 * что с ним в производстве.
 */
export default async function AdminExternalOrders({
  searchParams,
}: PageProps<"/admin/external-orders">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Внешние заказы">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const rawStatus = String(sp.status ?? "");
  const rawProduction = String(sp.production ?? "");
  const search = String(sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);

  // Значения фильтров принимаем только из словарей: чужая строка из
  // адреса иначе ушла бы прямо в запрос
  // Object.hasOwn, а не `in`: "constructor" из адреса - не статус
  const status = Object.hasOwn(EXTERNAL_PAYMENT_STATUS, rawStatus)
    ? (rawStatus as ExternalPaymentStatus)
    : null;
  const production =
    Object.hasOwn(EXTERNAL_PRODUCTION_STATUS, rawProduction)
      ? (rawProduction as ExternalProductionStatus)
      : null;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(externalOrders.status, status));
  if (production) conditions.push(eq(externalOrders.productionStatus, production));
  if (search) {
    const like = `%${search}%`;
    const byText = or(
      ilike(externalOrders.clientName, like),
      ilike(externalOrders.phone, like),
      ilike(externalOrders.email, like),
      ilike(externalOrders.description, like),
    );
    // Номер ищем отдельно: он число, и «81» должно находить заказ 81,
    // а не все, где эти цифры встретились в телефоне
    const asNumber = Number(search);
    const byId = Number.isInteger(asNumber) ? eq(externalOrders.id, asNumber) : undefined;
    const combined = byId ? or(byText, byId) : byText;
    if (combined) conditions.push(combined);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderPaid = db
    .select({
      externalOrderId: ordersAccounting.externalOrderId,
      paid: sql<string>`sum(${orderPayments.amount})`.as("paid"),
    })
    .from(orderPayments)
    .innerJoin(ordersAccounting, eq(ordersAccounting.id, orderPayments.orderAccountingId))
    .groupBy(ordersAccounting.externalOrderId)
    .as("order_paid");

  const [rows, [totals], byPayment, byProduction] = await Promise.all([
    db
      .select({
        id: externalOrders.id,
        clientName: externalOrders.clientName,
        phone: externalOrders.phone,
        description: externalOrders.description,
        status: externalOrders.status,
        productionStatus: externalOrders.productionStatus,
        totalPrice: externalOrders.totalPrice,
        readyDate: externalOrders.estimatedReadyDate,
        createdAt: externalOrders.createdAt,
      })
      .from(externalOrders)
      .where(where)
      .orderBy(desc(externalOrders.createdAt), desc(externalOrders.id))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    // «Оплачено» и «ждём» - из платежей карточки, а не из статуса: у
    // частично оплаченного заказа раньше вся сумма числилась долгом.
    // Отменённые заказы долгом не считаются. Колонки в списке выборки
    // пишем с таблицей сами: Drizzle выводит их там без имени таблицы, а
    // в соединении это неоднозначно
    db
      .select({
        n: count(),
        total: sql<string>`coalesce(sum(external_orders.total_price), 0)`,
        paid: sql<string>`coalesce(sum(order_paid.paid), 0)`,
        unpaid: sql<string>`coalesce(sum(greatest(external_orders.total_price - coalesce(order_paid.paid, 0), 0)) filter (where external_orders.production_status <> 'cancelled'), 0)`,
      })
      .from(externalOrders)
      .leftJoin(orderPaid, eq(orderPaid.externalOrderId, externalOrders.id))
      .where(where),
    db
      .select({ status: externalOrders.status, n: count() })
      .from(externalOrders)
      .groupBy(externalOrders.status),
    db
      .select({ status: externalOrders.productionStatus, n: count() })
      .from(externalOrders)
      .groupBy(externalOrders.productionStatus),
  ]);

  // Одна точка отсчёта на всю таблицу: иначе строки, отрисованные в
  // полночь, разошлись бы во мнении, просрочен ли заказ
  const now = new Date();

  // Число позиций берём отдельным запросом с группировкой, а не
  // подзапросом в списке выбора: Drizzle печатает столбцы в этом месте
  // без имени таблицы, и «where external_order_id = id» внутри подзапроса
  // сравнивал два столбца одной и той же таблицы - счётчик выходил
  // одинаковым у всех заказов
  const itemCounts = rows.length
    ? await db
        .select({ orderId: externalOrderItems.externalOrderId, n: count() })
        .from(externalOrderItems)
        .where(
          inArray(
            externalOrderItems.externalOrderId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(externalOrderItems.externalOrderId)
    : [];

  const itemsOf = new Map(itemCounts.map((r) => [r.orderId, Number(r.n)]));

  const found = Number(totals?.n ?? 0);
  const pages = Math.max(1, Math.ceil(found / PER_PAGE));
  const paymentCount = new Map(byPayment.map((r) => [r.status, Number(r.n)]));
  const productionCount = new Map(byProduction.map((r) => [r.status, Number(r.n)]));
  const allCount = byPayment.reduce((s, r) => s + Number(r.n), 0);

  const href = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { status, production, q: search, page: 1, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/admin/external-orders?${qs}` : "/admin/external-orders";
  };

  const canCreate = await can("orders", "create");

  return (
    <AdminPage
      title="Внешние заказы"
      subtitle={
        status || production || search
          ? `Найдено ${found} из ${allCount}`
          : `Всего ${allCount}`
      }
      actions={
        canCreate && (
          <Link
            href="/admin/external-orders/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВЫЙ ЗАКАЗ
          </Link>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Заказов" value={String(found)} />
        <AdminStat label="На сумму" value={money.format(Number(totals?.total ?? 0))} />
        <AdminStat
          label="Оплачено"
          value={money.format(Number(totals?.paid ?? 0))}
          tone="brand"
        />
        <AdminStat
          label="Ждём оплаты"
          value={money.format(Number(totals?.unpaid ?? 0))}
          tone={Number(totals?.unpaid ?? 0) > 0 ? "warn" : "plain"}
        />
      </div>

      <form action="/admin/external-orders" className="mt-6 flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        {production && <input type="hidden" name="production" value={production} />}
        <div className="relative flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={search}
            placeholder="Клиент, телефон, почта, описание или номер"
            aria-label="Поиск по внешним заказам"
            className="w-full rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-ink px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-graphite"
        >
          НАЙТИ
        </button>
        {(search || status || production) && (
          <Link
            href="/admin/external-orders"
            className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink"
          >
            СБРОСИТЬ
          </Link>
        )}
      </form>

      <nav className="mt-4 flex flex-wrap gap-2">
        <Chip href={href({ status: null })} active={!status}>
          Любая оплата · {allCount}
        </Chip>
        {(Object.keys(EXTERNAL_PAYMENT_STATUS) as ExternalPaymentStatus[]).map((key) => (
          <Chip key={key} href={href({ status: key })} active={status === key}>
            {EXTERNAL_PAYMENT_STATUS[key].label} · {paymentCount.get(key) ?? 0}
          </Chip>
        ))}
      </nav>

      <nav className="mt-2 flex flex-wrap gap-2">
        <Chip href={href({ production: null })} active={!production}>
          Любое производство
        </Chip>
        {(Object.keys(EXTERNAL_PRODUCTION_STATUS) as ExternalProductionStatus[])
          // Статусы, которых нет ни у одного заказа, в фильтре только мешают
          .filter((key) => (productionCount.get(key) ?? 0) > 0 || production === key)
          .map((key) => (
            <Chip key={key} href={href({ production: key })} active={production === key}>
              {EXTERNAL_PRODUCTION_STATUS[key].label} · {productionCount.get(key) ?? 0}
            </Chip>
          ))}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title="Ничего не нашлось"
            text="Попробуйте снять фильтры или изменить запрос."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                <th className="px-5 py-2.5">НОМЕР</th>
                <th className="px-4 py-2.5">КЛИЕНТ</th>
                <th className="px-4 py-2.5">ЗАКАЗ</th>
                <th className="px-4 py-2.5">СОЗДАН</th>
                <th className="px-4 py-2.5 text-right">СУММА</th>
                <th className="px-4 py-2.5">ОПЛАТА</th>
                <th className="px-5 py-2.5">ПРОИЗВОДСТВО</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const pay = externalPaymentStatus(o.status);
                const prod = externalProductionStatus(o.productionStatus);
                return (
                  <tr
                    key={o.id}
                    className={cn(
                      "border-b border-ink/6 last:border-0 hover:bg-paper",
                      isExternalClosed(o.productionStatus) && "opacity-70",
                    )}
                  >
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link
                        href={`/admin/external-orders/${o.id}`}
                        className="flex items-center gap-1 font-mono text-ink hover:text-brand"
                      >
                        {o.id}
                        <ChevronRight className="size-3 text-ink/25" aria-hidden />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{o.clientName}</span>
                      {o.phone && (
                        <span className="block font-mono text-xs text-ink/45">
                          {o.phone}
                        </span>
                      )}
                    </td>
                    <td className="max-w-72 px-4 py-3 text-ink/65">
                      <span className="line-clamp-2">{o.description || "-"}</span>
                      {(itemsOf.get(o.id) ?? 0) > 0 && (
                        <span className="text-xs text-ink/40">
                          позиций: {itemsOf.get(o.id)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                      {o.createdAt ? dt.format(o.createdAt) : "-"}
                      {o.readyDate &&
                        (isExternalLate(o.readyDate, o.productionStatus, now) ? (
                          <span className="block font-semibold text-danger">
                            срок был {dt.format(o.readyDate)}
                          </span>
                        ) : (
                          <span className="block text-ink/40">
                            готов {dt.format(o.readyDate)}
                          </span>
                        ))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                      {money.format(Number(o.totalPrice))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          pay.className,
                        )}
                      >
                        {pay.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          prod.className,
                        )}
                      >
                        {prod.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex flex-wrap items-center gap-2" aria-label="Страницы">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={href({ page: p })}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-xs",
                p === page
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-ink/12 text-ink/55 hover:border-ink/30 hover:text-ink",
              )}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </AdminPage>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3.5 py-1.5 text-xs",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-ink/12 text-ink/60 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
