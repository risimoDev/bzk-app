"use client";

import { useActionState } from "react";
import { PackageCheck } from "lucide-react";
import { receiveItem, type ReceiveState } from "./actions";

/**
 * Приёмка одной позиции закупки.
 *
 * По умолчанию подставляется весь непринятый остаток - чаще всего
 * привозят ровно заказанное, и лишний ввод только плодит опечатки.
 */
export function ReceiveForm({
  itemId,
  remaining,
  unit,
}: {
  itemId: number;
  remaining: number;
  unit: string;
}) {
  const [state, action, pending] = useActionState<ReceiveState, FormData>(
    receiveItem,
    {},
  );

  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="itemId" value={itemId} />

      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}

      <label htmlFor={`qty-${itemId}`} className="sr-only">
        Сколько принять, {unit}
      </label>
      <input
        id={`qty-${itemId}`}
        name="quantity"
        inputMode="decimal"
        defaultValue={remaining}
        className="w-24 rounded-lg border border-ink/15 bg-paper px-2 py-1.5 text-right font-mono text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      />

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
      >
        <PackageCheck className="size-3.5" aria-hidden />
        {pending ? "Принимаем…" : "Принять"}
      </button>
    </form>
  );
}
