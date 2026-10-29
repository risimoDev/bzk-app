import Link from "next/link";
import { DebtWarning } from "@/components/admin/DebtWarning";
import { ReconciliationForm } from "@/components/admin/ReconciliationForm";
import { can } from "@/lib/permissions";
import { loadDebtOrders } from "@/lib/debts-db";
import { bucketTotals, defaultActPeriod, overdueWarning, partyHref } from "@/lib/debts";
import { round2 } from "@/lib/order-money";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

/**
 * Блок «Долги и акт сверки» в карточке контрагента или клиента.
 *
 * Показывает, сколько плательщик должен сейчас, предупреждение о долге
 * старше 15 дней и форму акта сверки за период. Только для тех, кто
 * смотрит финансы: сумма долга - финансовые данные.
 */
export async function PartyDebtsPanel({ partyKey }: { partyKey: string }) {
  if (!(await can("finance", "view"))) return null;

  const debts = await loadDebtOrders({ partyKey });
  const total = round2(debts.reduce((s, d) => s + d.debt, 0));
  const buckets = bucketTotals(debts);
  const warning = overdueWarning(debts);
  const period = defaultActPeriod();

  return (
    <div className="rounded-xl border border-ink/10 bg-bone p-5">
      <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">ДОЛГИ И АКТ СВЕРКИ</h2>

      {debts.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">Неоплаченных заказов нет.</p>
      ) : (
        <div className="mt-2 text-sm text-ink/70">
          <p>
            Должен <b className="font-mono tabular-nums text-ink">{money.format(total)}</b> по заказам: {debts.length}.
          </p>
          <p className="mt-1 text-xs text-ink/50">
            до 5 дней: {money.format(buckets.fresh.sum)}; 6-14: {money.format(buckets.mid.sum)}; 15+:{" "}
            {money.format(buckets.old.sum)}
          </p>
          <Link
            href={partyHref(partyKey)}
            className="mt-1.5 inline-block text-xs text-brand underline underline-offset-2 hover:text-brand-bright"
          >
            Смотреть по заказам
          </Link>
        </div>
      )}

      <DebtWarning info={warning} className="mt-3" />

      <div className="mt-4 border-t border-ink/10 pt-4">
        <ReconciliationForm party={partyKey} from={period.from} to={period.to} compact />
      </div>
    </div>
  );
}
