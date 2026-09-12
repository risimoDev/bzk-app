"use client";

import { useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setDocumentsVisible, type DocumentsState } from "./actions";
import { cn } from "@/lib/cn";

const initial: DocumentsState = {};

/**
 * Показывать ли клиенту счёт и УПД.
 *
 * По умолчанию выключено: документы выставляются, когда состав и сумма
 * согласованы. Пока менеджер не открыл их, клиент в кабинете видит
 * только состав заказа.
 */
export function DocumentsToggle({
  source,
  orderId,
  visible,
}: {
  source: "site" | "external";
  orderId: number;
  visible: boolean;
}) {
  const [state, action, pending] = useActionState(setDocumentsVisible, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="visible" value={visible ? "0" : "1"} />

      <p className="text-sm text-ink/60">
        {visible
          ? "Клиент видит счёт и УПД в кабинете."
          : "Клиенту документы пока не показываем - он видит только состав."}
      </p>

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-display text-xs tracking-wider transition-colors disabled:opacity-60",
          visible
            ? "border border-ink/15 text-ink/60 hover:border-danger/40 hover:text-danger"
            : "bg-brand text-bone hover:bg-brand-bright",
        )}
      >
        {visible ? (
          <EyeOff className="size-3.5" aria-hidden />
        ) : (
          <Eye className="size-3.5" aria-hidden />
        )}
        {pending
          ? "СОХРАНЯЮ…"
          : visible
            ? "СКРЫТЬ ОТ КЛИЕНТА"
            : "ОТКРЫТЬ КЛИЕНТУ"}
      </button>

      {(state.message || state.error) && (
        <span
          className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}
