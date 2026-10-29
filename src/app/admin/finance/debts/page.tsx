import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Info } from "lucide-react";
import { AdminPage, AdminStat, AdminEmpty } from "@/components/admin/AdminPage";
import { ReconciliationForm } from "@/components/admin/ReconciliationForm";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { statusOf } from "@/lib/order-status";
import { loadDebtOrders, groupDebtors, debtsOfParty } from "@/lib/debts-db";
import { DEBT_BUCKETS, bucketTotals, debtBucket, defaultActPeriod, parsePartyKey, type DebtBucketKey } from "@/lib/debts";
import { REPORT_TZ } from "@/lib/analytics";
import { round2 } from "@/lib/order-money";

export const metadata: Metadata = {
  title: "Долги · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: REPORT_TZ,
});

const BUCKET_STYLE: Record<DebtBucketKey, string> = {
  fresh: "bg-ink/10 text-ink/65",
  mid: "bg-warn/15 text-warn",
  old: "bg-danger/12 text-danger",
};

/** Куда вести по имени плательщика: контрагент, клиент сайта или никуда. */
function partyLink(key: string) {
  const p = parsePartyKey(key);
  if (p?.kind === "counterparty") return `/admin/counterparties/${p.id}`;
  if (p?.kind === "user") return `/admin/clients/${p.id}`;
  return null;
}

export default async function AdminDebts(props: PageProps<"/admin/finance/debts">) {
  if (!(await can("finance", "view"))) {
    return (
      <AdminPage title="Долги">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть финансы." />
      </AdminPage>
    );
  }

  const sp = await props.searchParams;
  const rawParty = Array.isArray(sp.party) ? sp.party[0] : sp.party;
  const partyKey = rawParty && parsePartyKey(rawParty) ? rawParty : null;

  const now = new Date();
  const all = await loadDebtOrders({ now });
  const shown = partyKey ? await debtsOfParty(all, partyKey) : null;

  // Сводка всегда по всем должникам: фильтр по одному плательщику
  // не должен выдавать его долг за общий
  const totals = bucketTotals(all);
  const ready = all.filter((o) => o.ageDays !== null);
  const readyDebt = round2(ready.reduce((s, o) => s + o.debt, 0));
  const waiting = all.filter((o) => o.ageDays === null);
  const waitingDebt = round2(waiting.reduce((s, o) => s + o.debt, 0));

  const debtors = groupDebtors(shown ?? all);
  const period = defaultActPeriod(now);

  return (
    <AdminPage
      title="Долги"
      subtitle="Неоплаченные заказы, которые уже готовы или выданы. Возраст долга считается со дня готовности."
      actions={
        <Link
          href="/admin/finance"
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          К БУХГАЛТЕРИИ
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DEBT_BUCKETS.map((b) => (
          <AdminStat
            key={b.key}
            label={b.label.toUpperCase()}
            value={money.format(totals[b.key].sum)}
            tone={b.key === "old" && totals.old.sum > 0 ? "warn" : "plain"}
            hint={`заказов: ${totals[b.key].n}`}
          />
        ))}
        <AdminStat
          label="ВСЕГО К ПОЛУЧЕНИЮ"
          value={money.format(readyDebt)}
          tone="brand"
          hint={`готовых заказов: ${ready.length}`}
        />
      </div>

      {waiting.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-xs text-ink/55">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Ещё не готовы и в сводку не входят: {waiting.length} шт. на {money.format(waitingDebt)}. Отсчёт долга
          у них начнётся, когда заказ станет «Готов к выдаче» или уйдёт клиенту.
        </p>
      )}

      {partyKey && shown && (
        <p className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm text-ink/75">
          Показан один плательщик{shown[0] ? `: ${shown[0].partyName}` : ""}.
          <Link href="/admin/finance/debts" className="text-brand underline underline-offset-2 hover:text-brand-bright">
            Показать всех
          </Link>
        </p>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg text-ink">Должники</h2>

      {debtors.length === 0 ? (
        <AdminEmpty
          title={partyKey ? "У этого плательщика долгов нет" : "Долгов нет"}
          text="Все готовые заказы оплачены."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {debtors.map((d) => {
            const link = partyLink(d.partyKey);
            const bucket = d.oldestAge === null ? null : debtBucket(d.oldestAge);
            return (
              <section key={d.partyKey} className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
                  <div>
                    <h3 className="font-display text-base text-ink">
                      {link ? (
                        <Link href={link} className="hover:text-brand">
                          {d.name}
                        </Link>
                      ) : (
                        d.name
                      )}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {d.partyKey.startsWith("n:")
                        ? "Контрагент не привязан: заказы объединены по имени. Привяжите контрагента в карточке заказа."
                        : d.partyKey.startsWith("c:")
                          ? "Контрагент"
                          : "Клиент сайта"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg tabular-nums text-ink">{money.format(d.debt)}</p>
                    {bucket && (
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                          BUCKET_STYLE[bucket],
                        )}
                      >
                        старейший: {d.oldestAge} дн.
                      </span>
                    )}
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                        <th className="px-5 py-2.5">ЗАКАЗ</th>
                        <th className="px-4 py-2.5">СТАТУС</th>
                        <th className="px-4 py-2.5">ГОТОВ С</th>
                        <th className="px-4 py-2.5">ВОЗРАСТ</th>
                        <th className="px-4 py-2.5 text-right">ДОЛГ</th>
                        <th className="px-5 py-2.5">ОТВЕТСТВЕННЫЙ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.orders.map((o) => {
                        const st = statusOf(o.status);
                        const b = o.ageDays === null ? null : debtBucket(o.ageDays);
                        return (
                          <tr key={o.cardId} className="border-b border-ink/6 last:border-0">
                            <td className="whitespace-nowrap px-5 py-3">
                              <Link href={o.href} className="font-mono text-ink hover:text-brand">
                                №{o.number}
                              </Link>
                              <span className="ml-2 text-xs text-ink/40">
                                {o.source === "external" ? "менеджера" : "с сайта"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className={cn("rounded px-2 py-0.5 text-xs", st.className)}>{st.label}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/60">
                              {o.since ? dt.format(o.since) : "-"}
                              {o.approximate && (
                                <span
                                  className="ml-1 text-warn"
                                  title="Дата приблизительная: в журнале нет записи о готовности, взята дата заказа"
                                >
                                  ≈
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {b && o.ageDays !== null ? (
                                <span
                                  className={cn(
                                    "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                                    BUCKET_STYLE[b],
                                  )}
                                >
                                  {o.ageDays} дн.
                                </span>
                              ) : (
                                <span className="text-xs text-ink/40">не готов</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                              {money.format(o.debt)}
                              {o.paid > 0 && (
                                <span className="block text-[0.65rem] text-ink/40">из {money.format(o.income)}</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-ink/65">{o.responsibleName ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <footer className="border-t border-ink/10 px-5 py-3">
                  {d.partyKey.startsWith("n:") ? (
                    <p className="text-xs text-ink/45">
                      Акт сверки доступен после привязки контрагента: по имени заказы легко перепутать.
                    </p>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand hover:text-brand-bright">
                        Акт сверки за период
                      </summary>
                      <div className="mt-3">
                        <ReconciliationForm party={d.partyKey} from={period.from} to={period.to} compact />
                      </div>
                    </details>
                  )}
                </footer>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-ink/45">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Долг заказа - доход минус платежи, отменённые заказы не считаются (как в бухгалтерии). Знак ≈ у даты значит,
        что о готовности заказа нет записи в журнале и взята дата заказа. По таким заказам задачи менеджерам не
        заводятся: неизвестно, когда долг стал просроченным.
      </p>
    </AdminPage>
  );
}
