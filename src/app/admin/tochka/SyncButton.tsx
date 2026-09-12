"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { syncPaymentStatuses, type TochkaState } from "@/app/actions/tochka";
import { cn } from "@/lib/cn";

const initial: TochkaState = { ok: false };

/** Сверка статусов оплаты по кнопке: банк сам о платежах не сообщает. */
export function SyncButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(syncPaymentStatuses, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? "Интеграция не настроена" : undefined}
        className="flex items-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink disabled:opacity-45"
      >
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
        {pending ? "СВЕРЯЮ…" : "СВЕРИТЬ ОПЛАТЫ"}
      </button>

      {state.message && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
