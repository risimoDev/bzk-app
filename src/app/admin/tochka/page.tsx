import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { CircleCheck, CircleAlert, Landmark, Link2 } from "lucide-react";
import { db } from "@/db";
import { tochkaInvoices, tochkaClosingDocuments } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  isTochkaConfigured,
  getCustomerCode,
  getCustomers,
  getAccountsList,
  getTotalBalance,
  type AccountSummary,
  type TotalBalance,
} from "@/lib/tochka";
import { CustomerPicker, type CustomerOption } from "./CustomerPicker";
import { SyncButton } from "./SyncButton";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Точка Банк · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const PAYMENT_STATUS = {
  waiting: { label: "Ждёт оплаты", className: "bg-warn/15 text-warn" },
  paid: { label: "Оплачен", className: "bg-ok/15 text-ok" },
  expired: { label: "Просрочен", className: "bg-danger/12 text-danger" },
} as const;

const CLOSING_TYPE = {
  act: "Акт выполненных работ",
  invoice: "Счёт-фактура",
  waybill: "Товарная накладная",
} as const;

/**
 * Интеграция с Точка Банком.
 *
 * Страница работает и без связи с банком: счета и закрывающие документы
 * лежат в нашей базе, а живые данные - компании, счета, остаток -
 * подтягиваются только когда настроен токен. Ошибка банка не должна
 * прятать то, что уже выставлено.
 */
export default async function AdminTochka() {
  if (!(await can("finance", "view"))) {
    return (
      <AdminPage title="Точка Банк">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть финансы." />
      </AdminPage>
    );
  }

  const configured = isTochkaConfigured();
  const customerCode = await getCustomerCode();
  const canEdit = await can("settings", "edit");
  // Сверка пишет платежи в бухгалтерию - ей нужно право на изменение финансов
  const canSync = await can("finance", "edit");

  const [invoices, closing] = await Promise.all([
    db.select().from(tochkaInvoices).orderBy(desc(tochkaInvoices.createdAt)),
    db
      .select()
      .from(tochkaClosingDocuments)
      .orderBy(desc(tochkaClosingDocuments.createdAt)),
  ]);

  // Живые данные берём одной попыткой: если банк молчит, показываем
  // причину рядом с настройками и не роняем остальную страницу
  let customers: CustomerOption[] = [];
  let accounts: AccountSummary[] = [];
  let balance: TotalBalance | null = null;
  let apiError: string | null = null;

  if (configured) {
    try {
      const list = await getCustomers();
      customers = list.map((c) => ({
        code: c.customerCode,
        label: c.shortName || c.fullName || c.customerCode,
        type: c.customerType ?? "",
      }));
      if (customerCode) {
        accounts = await getAccountsList();
        balance = await getTotalBalance();
      }
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
  }

  const waiting = invoices.filter((i) => i.paymentStatus === "waiting");
  const waitingSum = waiting.reduce((s, i) => s + Number(i.amount), 0);
  const paidSum = invoices
    .filter((i) => i.paymentStatus === "paid")
    .reduce((s, i) => s + Number(i.amount), 0);

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  return (
    <AdminPage
      title="Точка Банк"
      subtitle="Счета на оплату и закрывающие документы через API банка"
    >
      {/* -------------------------------------------------- состояние */}
      <div
        className={cn(
          "flex flex-wrap items-start gap-3 rounded-xl border px-5 py-4 text-sm",
          configured && customerCode && !apiError
            ? "border-ok/25 bg-ok/8"
            : "border-warn/30 bg-warn/8",
        )}
      >
        {configured && customerCode && !apiError ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        )}

        <div className="flex-1">
          {!configured ? (
            <>
              <p className="text-ink">Интеграция не настроена.</p>
              <p className="mt-1 text-ink/60">
                Добавьте JWT-токен банка в переменную окружения{" "}
                <code className="font-mono text-xs">TOCHKA_TOKEN</code> и перезапустите
                приложение. Токен выпускается в личном кабинете Точки, в разделе для
                разработчиков.
              </p>
            </>
          ) : apiError ? (
            <>
              <p className="text-ink">Токен задан, но банк ответил ошибкой.</p>
              <p className="mt-1 font-mono text-xs text-ink/60">{apiError}</p>
            </>
          ) : !customerCode ? (
            <p className="text-ink">
              Токен работает. Осталось выбрать компанию - её код уходит в каждый запрос.
            </p>
          ) : (
            <p className="text-ink">
              Подключено. Компания{" "}
              <span className="font-mono">{customerCode}</span>, счетов в банке:{" "}
              {accounts.length}.
            </p>
          )}
        </div>
      </div>

      {configured && customers.length > 0 && (
        <div className="mt-5 rounded-xl border border-ink/10 bg-bone px-5 py-4">
          <CustomerPicker customers={customers} current={customerCode} canEdit={canEdit} />
        </div>
      )}

      {/* ------------------------------------------------------ цифры */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat
          label="Остаток на счетах"
          value={balance ? money.format(balance.total) : "-"}
          hint={balance ? `счетов: ${balance.accounts.length}` : "нужна связь с банком"}
          tone={balance ? "brand" : "plain"}
        />
        <AdminStat label="Счетов выставлено" value={String(invoices.length)} />
        <AdminStat
          label="Ждут оплаты"
          value={money.format(waitingSum)}
          hint={`${waiting.length} шт.`}
          tone={waiting.length > 0 ? "warn" : "plain"}
        />
        <AdminStat label="Оплачено" value={money.format(paidSum)} />
      </div>

      {balance && balance.accounts.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {balance.accounts.map((a) => (
            <li
              key={a.accountId}
              className="flex items-center gap-2.5 rounded-lg border border-ink/10 bg-bone px-4 py-2.5 text-sm"
            >
              <Landmark className="size-3.5 text-ink/40" aria-hidden />
              <span className="font-mono text-xs text-ink/55">{a.accountNumber || "-"}</span>
              <span className="font-mono tabular-nums text-ink">
                {money.format(a.balance)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------ счета */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-ink">Счета на оплату</h2>
          <SyncButton disabled={!configured || !customerCode || !canSync} />
        </div>

        {invoices.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty title="Счетов нет" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                  <th className="px-5 py-2.5">КЛИЕНТ</th>
                  <th className="px-4 py-2.5">ИНН / КПП</th>
                  <th className="px-4 py-2.5">ВЫСТАВЛЕН</th>
                  <th className="px-4 py-2.5 text-right">СУММА</th>
                  <th className="px-5 py-2.5">СТАТУС</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const st =
                    PAYMENT_STATUS[
                      (i.paymentStatus ?? "waiting") as keyof typeof PAYMENT_STATUS
                    ] ?? PAYMENT_STATUS.waiting;

                  return (
                    <tr key={i.id} className="border-b border-ink/6 last:border-0">
                      <td className="px-5 py-3">
                        <span className="text-ink">{i.clientName ?? "-"}</span>
                        {i.orderId && (
                          <Link
                            href={`/admin/orders/${i.orderId}`}
                            className="mt-0.5 flex items-center gap-1 text-xs text-ink/45 hover:text-brand"
                          >
                            <Link2 className="size-3" aria-hidden />
                            заказ №{i.orderId}
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                        {i.clientInn || "-"}
                        {i.clientKpp ? ` / ${i.clientKpp}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/55">
                        {i.createdAt ? dtTime.format(i.createdAt) : "-"}
                        {i.paidAt && (
                          <span className="block text-ok">
                            оплачен {dtTime.format(i.paidAt)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {money.format(Number(i.amount))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                            st.className,
                          )}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------- закрывающие документы */}
      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Закрывающие документы</h2>

        {closing.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty title="Документов нет" />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {closing.map((d) => {
              const linked = d.linkedInvoiceId
                ? invoiceById.get(d.linkedInvoiceId)
                : undefined;

              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
                >
                  <div>
                    <span className="text-ink">{CLOSING_TYPE[d.documentType]}</span>
                    <span className="block text-xs text-ink/50">
                      {d.clientName ?? "-"}
                      {d.clientInn ? ` · ИНН ${d.clientInn}` : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs text-ink/50">
                    {linked && (
                      <span>
                        к счёту на {money.format(Number(linked.amount))}
                      </span>
                    )}
                    {d.createdAt && (
                      <span className="font-mono">{dtTime.format(d.createdAt)}</span>
                    )}
                    <span className="font-mono text-sm tabular-nums text-ink">
                      {money.format(Number(d.amount))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 max-w-2xl text-xs text-ink/45">
        Выставление счетов и актов прямо из карточки заказа - следующим шагом. Таблица
        закрывающих документов хранит три типа: акт, счёт-фактуру и накладную; УПД
        печатается собственной формой, без обращения к банку.
      </p>
    </AdminPage>
  );
}
