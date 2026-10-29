import { FileSpreadsheet } from "lucide-react";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

/**
 * Форма «Акт сверки»: период и кнопка. Обычная GET-форма без скриптов -
 * печатная страница открывается в новой вкладке и сама всё считает.
 * Период по умолчанию - с начала года по сегодня.
 */
export function ReconciliationForm({
  party,
  from,
  to,
  compact,
}: {
  party: string;
  from: string;
  to: string;
  compact?: boolean;
}) {
  return (
    <form
      method="get"
      action="/print/reconciliation"
      target="_blank"
      className={compact ? "flex flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-3"}
    >
      <input type="hidden" name="party" value={party} />
      <label className="flex flex-col gap-1">
        <span className={adminLabelClass}>С</span>
        <input type="date" name="from" defaultValue={from} required className={adminInputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={adminLabelClass}>ПО</span>
        <input type="date" name="to" defaultValue={to} required className={adminInputClass} />
      </label>
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand"
      >
        <FileSpreadsheet className="size-3.5" aria-hidden />
        АКТ СВЕРКИ
      </button>
    </form>
  );
}
