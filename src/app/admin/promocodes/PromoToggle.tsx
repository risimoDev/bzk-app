"use client";

import { useActionState } from "react";
import { Power } from "lucide-react";
import { togglePromocode, type InboxState } from "@/app/actions/inbox";
import { cn } from "@/lib/cn";

const initial: InboxState = { ok: false };

/** Включить или выключить промокод. Удаления нет: код мог быть использован. */
export function PromoToggle({ promoId, active }: { promoId: number; active: boolean }) {
  const [state, action, pending] = useActionState(togglePromocode, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="promoId" value={promoId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
          active
            ? "border border-ink/12 text-ink/50 hover:border-danger/40 hover:text-danger"
            : "border border-ink/12 text-ink/50 hover:border-ok/40 hover:text-ok",
          pending && "opacity-60",
        )}
      >
        <Power className="size-3" aria-hidden />
        {active ? "ВЫКЛЮЧИТЬ" : "ВКЛЮЧИТЬ"}
      </button>
      {state.message && (
        <span
          className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
