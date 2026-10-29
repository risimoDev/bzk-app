import { cn } from "@/lib/cn";
import { ITEM_CATEGORY, type OrderStructure as Structure } from "@/lib/order-structure";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const pct = (v: number | null) => (v === null ? "-" : `${String(v).replace(".", ",")}%`);

/**
 * Таблица «Структура заказа»: выручка, расход и маржа по видам работ.
 * Одна на карточку заказа и на аналитику - чтобы цифры читались одинаково.
 *
 * Корректировка стоит отдельной строкой, а не растворена в категориях:
 * скидка 10 % на заказ целиком не делает «печать» менее прибыльной, чем
 * «монтаж», и показывать это в строках категорий значило бы врать.
 */
export function OrderStructureTable({
  structure,
  adjustmentLabel = "Корректировка заказа (скидка или наценка)",
  totalLabel = "Итого по заказу",
}: {
  structure: Structure;
  adjustmentLabel?: string;
  totalLabel?: string;
}) {
  const { rows, adjustment, total } = structure;
  const signed = (v: number) => (v < 0 ? "−" : "+") + money.format(Math.abs(v));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[36rem] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
            <th className="px-5 py-2.5">ВИД РАБОТ</th>
            <th className="px-4 py-2.5 text-right">ПОЗИЦИЙ</th>
            <th className="px-4 py-2.5 text-right">ВЫРУЧКА</th>
            <th className="px-4 py-2.5 text-right">РАСХОД</th>
            <th className="px-4 py-2.5 text-right">МАРЖА</th>
            <th className="px-5 py-2.5 text-right">МАРЖА, %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} className="border-b border-ink/6">
              <td className="px-5 py-2.5 text-ink">{ITEM_CATEGORY[r.category].label}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink/55">
                {r.count}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                {money.format(r.revenue)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-ink/55">
                {r.expense > 0 ? money.format(r.expense) : "-"}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums",
                  r.margin < 0 ? "text-danger" : "text-ok",
                )}
              >
                {money.format(r.margin)}
              </td>
              <td className="px-5 py-2.5 text-right font-mono tabular-nums text-ink/60">
                {pct(r.marginPct)}
              </td>
            </tr>
          ))}

          {adjustment !== 0 && (
            <tr className="border-b border-ink/6">
              <td className="px-5 py-2.5 text-ink/70">{adjustmentLabel}</td>
              <td className="px-4 py-2.5" />
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums",
                  adjustment < 0 ? "text-danger" : "text-ink",
                )}
              >
                {signed(adjustment)}
              </td>
              <td className="px-4 py-2.5" />
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums",
                  adjustment < 0 ? "text-danger" : "text-ok",
                )}
              >
                {signed(adjustment)}
              </td>
              <td className="px-5 py-2.5" />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink/15 font-medium">
            <td className="px-5 py-3 text-ink">{totalLabel}</td>
            <td className="px-4 py-3 text-right font-mono tabular-nums text-ink/55">
              {total.count}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
              {money.format(total.revenue)}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
              {total.expense > 0 ? money.format(total.expense) : "-"}
            </td>
            <td
              className={cn(
                "whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums",
                total.margin < 0 ? "text-danger" : "text-ok",
              )}
            >
              {money.format(total.margin)}
            </td>
            <td className="px-5 py-3 text-right font-mono tabular-nums text-ink/70">
              {pct(total.marginPct)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
