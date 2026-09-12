"use client";

import { useActionState } from "react";
import { selectCustomer, type TochkaState } from "@/app/actions/tochka";
import { cn } from "@/lib/cn";

const initial: TochkaState = { ok: false };

export type CustomerOption = {
  code: string;
  label: string;
  type: string;
};

/**
 * Выбор компании в Точке. Код компании уходит в заголовок каждого запроса
 * к банку, поэтому без него не выставить ни одного счёта.
 */
export function CustomerPicker({
  customers,
  current,
  canEdit,
}: {
  customers: CustomerOption[];
  current: string | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(selectCustomer, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-col gap-1.5">
        <label
          htmlFor="customerCode"
          className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
        >
          КОМПАНИЯ
        </label>
        <select
          id="customerCode"
          name="customerCode"
          defaultValue={current ?? ""}
          disabled={!canEdit || pending}
          className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright disabled:opacity-60"
        >
          <option value="">- не выбрана -</option>
          {customers.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} · {c.code}
              {c.type ? ` · ${c.type}` : ""}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={!canEdit || pending}
        className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-45"
      >
        {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
      </button>

      {state.message && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
