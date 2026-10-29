import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, count, sql } from "drizzle-orm";
import { ArrowLeft, Mail, Phone, Building2, Ban, Wand2, Boxes, MapPin } from "lucide-react";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { statusOf } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { currentUser } from "@/auth";
import { setBlocked, setEditorAccess, setWarehouseAccess } from "../actions";
import { ResetLinkButton } from "./ResetLinkButton";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Клиент · Админка",
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

export default async function AdminClient(
  props: PageProps<"/admin/clients/[id]">,
) {
  if (!(await can("users", "view"))) {
    return (
      <AdminPage title="Клиент">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  const clientId = parseId(id);
  if (clientId === null) notFound();

  const [client] = await db
    .select()
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);

  if (!client) notFound();

  const [list, [totals]] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.totalPrice,
        createdAt: orders.createdAt,
        isUrgent: orders.isUrgent,
      })
      .from(orders)
      .where(eq(orders.userId, client.id))
      .orderBy(desc(orders.createdAt))
      .limit(50),
    db
      .select({
        n: count(),
        sum: sql<string>`coalesce(sum(${orders.totalPrice}), 0)`,
      })
      .from(orders)
      .where(eq(orders.userId, client.id)),
  ]);

  const me = await currentUser();
  // Учётную запись администратора трогает только администратор (так же
  // отвечает сервер, см. loadTarget в ../actions.ts): менеджеру кнопки не
  // показываем, иначе он нажал бы и получил молчаливый отказ
  const manageable =
    (await can("users", "manage")) && !(client.role === "admin" && me?.role !== "admin");
  const isSelf = me != null && Number(me.id) === client.id;

  return (
    <AdminPage
      title={client.name}
      subtitle={client.companyName ?? undefined}
      actions={
        <Link
          href="/admin/clients"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К списку
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminStat label="Заказов" value={String(totals?.n ?? 0)} />
            <AdminStat
              label="На сумму"
              value={money.format(Number(totals?.sum ?? 0))}
              tone="brand"
            />
            <AdminStat
              label="С нами с"
              value={client.createdAt ? dt.format(client.createdAt) : "-"}
            />
          </div>

          <h2 className="mb-3 mt-8 font-display text-lg text-ink">Заказы</h2>

          {list.length === 0 ? (
            <AdminEmpty
              title="Заказов нет"
              text="Клиент зарегистрирован, но пока ничего не заказывал."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>№</Th>
                    <Th>Статус</Th>
                    <Th>Дата</Th>
                    <Th className="text-right">Сумма</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => {
                    const st = statusOf(o.status);
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-ink/6 last:border-0 hover:bg-paper"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="font-mono text-ink hover:text-brand"
                          >
                            {o.id}
                          </Link>
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
                          {o.isUrgent && (
                            <span className="ml-1.5 rounded bg-danger/12 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-danger">
                              СРОЧНО
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-ink/60">
                          {o.createdAt ? dt.format(o.createdAt) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                          {money.format(Number(o.total))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              Контакты
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li>
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-2 text-ink/75 hover:text-brand"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden />
                  {client.email}
                </a>
              </li>
              {client.phone && (
                <li>
                  <a
                    href={`tel:${client.phone}`}
                    className="flex items-center gap-2 text-ink/75 hover:text-brand"
                  >
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    {client.phone}
                  </a>
                </li>
              )}
              {client.shippingAddress && (
                <li className="flex items-start gap-2 text-ink/75">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {client.shippingAddress}
                </li>
              )}
            </ul>
          </div>

          {client.isCorporate && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <p className="flex items-center gap-2 font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                <Building2 className="size-3.5" aria-hidden />
                Юридическое лицо
              </p>
              <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                {client.companyName && (
                  <Row label="Название" value={client.companyName} />
                )}
                {client.inn && <Row label="ИНН" value={client.inn} mono />}
                {client.kpp && <Row label="КПП" value={client.kpp} mono />}
                {client.legalAddress && (
                  <Row label="Юр. адрес" value={client.legalAddress} />
                )}
              </dl>
            </div>
          )}

          {manageable && (
            <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-bone p-5">
              <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                Доступ
              </p>

              <form action={setEditorAccess}>
                <input type="hidden" name="userId" value={client.id} />
                <input
                  type="hidden"
                  name="allowed"
                  value={client.canUseEditor ? "0" : "1"}
                />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    client.canUseEditor
                      ? "border-brand bg-brand/10 text-brand hover:bg-brand/15"
                      : "border-ink/15 text-ink/70 hover:border-brand hover:text-brand",
                  )}
                >
                  <Wand2 className="size-4" aria-hidden />
                  {client.canUseEditor
                    ? "Закрыть редактор открыток"
                    : "Открыть редактор открыток"}
                </button>
              </form>

              <form action={setWarehouseAccess}>
                <input type="hidden" name="userId" value={client.id} />
                <input
                  type="hidden"
                  name="allowed"
                  value={client.miniWarehouseEnabled ? "0" : "1"}
                />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    client.miniWarehouseEnabled
                      ? "border-brand bg-brand/10 text-brand hover:bg-brand/15"
                      : "border-ink/15 text-ink/70 hover:border-brand hover:text-brand",
                  )}
                >
                  <Boxes className="size-4" aria-hidden />
                  {client.miniWarehouseEnabled
                    ? "Закрыть мини-склад"
                    : "Открыть мини-склад"}
                </button>
              </form>

              <ResetLinkButton userId={client.id} />

              <form action={setBlocked}>
                <input type="hidden" name="userId" value={client.id} />
                <input
                  type="hidden"
                  name="blocked"
                  value={client.isBlocked ? "0" : "1"}
                />
                <button
                  type="submit"
                  disabled={isSelf}
                  title={
                    isSelf ? "Нельзя заблокировать самого себя" : undefined
                  }
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    client.isBlocked
                      ? "border-danger bg-danger/10 text-danger hover:bg-danger/15"
                      : "border-ink/15 text-ink/70 enabled:hover:border-danger enabled:hover:text-danger",
                  )}
                >
                  <Ban className="size-4" aria-hidden />
                  {client.isBlocked ? "Разблокировать" : "Заблокировать"}
                </button>
              </form>

              <p className="text-xs text-ink/45">
                Блокировка действует сразу: клиента выкинет из кабинета на
                ближайшем же запросе, не дожидаясь окончания сессии.
              </p>
            </div>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink/45">{label}</dt>
      <dd className={cn("text-right text-ink/80", mono && "font-mono")}>
        {value}
      </dd>
    </div>
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
