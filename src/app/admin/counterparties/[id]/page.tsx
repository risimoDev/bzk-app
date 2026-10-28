import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Plus } from "lucide-react";
import { db } from "@/db";
import { clients, externalOrders, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  externalPaymentStatus,
  externalProductionStatus,
} from "@/lib/external-orders";
import { CounterpartyForm } from "../CounterpartyForm";
import { ArchiveButton, LinkAccountForm } from "./LinkControls";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Контрагент · Админка",
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

export default async function AdminCounterparty({
  params,
}: PageProps<"/admin/counterparties/[id]">) {
  if (!(await can("users", "view"))) {
    return (
      <AdminPage title="Контрагент">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть контрагентов." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const clientId = parseId(id);
  if (clientId === null) notFound();

  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!row) notFound();

  const canEdit = await can("users", "edit");

  const [orders, accounts, linkedAccount] = await Promise.all([
    db
      .select({
        id: externalOrders.id,
        description: externalOrders.description,
        status: externalOrders.status,
        productionStatus: externalOrders.productionStatus,
        totalPrice: externalOrders.totalPrice,
        createdAt: externalOrders.createdAt,
      })
      .from(externalOrders)
      .where(eq(externalOrders.clientId, clientId))
      .orderBy(desc(externalOrders.createdAt), desc(externalOrders.id)),
    // Привязывать имеет смысл только к аккаунтам клиентов: сотрудник
    // сам себе заказчиком не бывает
    canEdit
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(and(eq(users.role, "user"), eq(users.isBlocked, false)))
          .orderBy(asc(users.name))
          .limit(200)
      : Promise.resolve([]),
    row.userId
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const total = orders.reduce((s, o) => s + Number(o.totalPrice), 0);

  return (
    <AdminPage
      title={row.companyName || row.name}
      subtitle={row.companyName ? row.name : undefined}
      actions={
        <>
          <Link
            href="/admin/counterparties"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            К СПИСКУ
          </Link>
          {canEdit && (
            <Link
              href={`/admin/external-orders/new?client=${row.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
            >
              <Plus className="size-3.5" aria-hidden />
              НОВЫЙ ЗАКАЗ
            </Link>
          )}
        </>
      }
    >
      {row.isArchived && (
        <p className="mb-5 rounded-xl border border-warn/30 bg-warn/8 px-5 py-3 text-sm text-ink/75">
          Контрагент в архиве - в подсказках при заведении заказа он не появится.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat label="Заказов" value={String(orders.length)} />
        <AdminStat label="На сумму" value={money.format(total)} tone="brand" />
        <AdminStat
          label="Кабинет на сайте"
          value={linkedAccount[0] ? "есть" : "нет"}
          hint={linkedAccount[0]?.email}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {canEdit ? (
            <CounterpartyForm
              value={{
                id: row.id,
                name: row.name,
                companyName: row.companyName,
                phone: row.phone,
                email: row.email,
                inn: row.inn,
                address: row.address,
                notes: row.notes,
              }}
            />
          ) : (
            <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4 text-sm text-ink/75">
              <p>{row.phone ?? "телефон не указан"}</p>
              <p>{row.email ?? "почта не указана"}</p>
              {row.address && <p className="mt-2">{row.address}</p>}
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <header className="border-b border-ink/10 px-5 py-3">
              <h2 className="font-display text-base text-ink">Заказы</h2>
            </header>

            {orders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink/50">
                Заказов пока нет. Если они заведены на это же имя, но без контрагента,
                прицепите их в карточке заказа.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                <table className="min-w-[34rem] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                      <th className="px-5 py-2.5">НОМЕР</th>
                      <th className="px-4 py-2.5">ЗАКАЗ</th>
                      <th className="px-4 py-2.5">СОЗДАН</th>
                      <th className="px-4 py-2.5 text-right">СУММА</th>
                      <th className="px-5 py-2.5">СОСТОЯНИЕ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const pay = externalPaymentStatus(o.status);
                      const prod = externalProductionStatus(o.productionStatus);
                      return (
                        <tr key={o.id} className="border-b border-ink/6 last:border-0">
                          <td className="px-5 py-3">
                            <Link
                              href={`/admin/external-orders/${o.id}`}
                              className="font-mono text-ink hover:text-brand"
                            >
                              {o.id}
                            </Link>
                          </td>
                          <td className="max-w-72 px-4 py-3 text-ink/65">
                            <span className="line-clamp-1">{o.description || "-"}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                            {o.createdAt ? dt.format(o.createdAt) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                            {money.format(Number(o.totalPrice))}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                                pay.className,
                              )}
                            >
                              {pay.label}
                            </span>
                            <span className="ml-1.5 text-xs text-ink/45">{prod.label}</span>
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
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              КАБИНЕТ НА САЙТЕ
            </h2>
            <p className="mt-2 text-sm text-ink/60">
              Привязка одним действием показывает клиенту все его заказы - и прошлые
              тоже.
            </p>
            <div className="mt-4">
              {canEdit ? (
                <LinkAccountForm
                  id={row.id}
                  current={row.userId}
                  accounts={accounts}
                />
              ) : linkedAccount[0] ? (
                <p className="text-sm text-ink">{linkedAccount[0].name}</p>
              ) : (
                <p className="text-sm text-ink/45">Не привязан</p>
              )}
            </div>
          </div>

          {row.notes && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                ЗАМЕТКИ
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm text-ink/75">{row.notes}</p>
            </div>
          )}

          {canEdit && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                АРХИВ
              </h2>
              <p className="mt-2 mb-3 text-sm text-ink/55">
                Удалить контрагента нельзя: за ним заказы и деньги.
              </p>
              <ArchiveButton id={row.id} archived={row.isArchived} />
            </div>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}
