"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { completeReminder, type CrmState } from "@/app/actions/crm";

const initial: CrmState = { ok: false };

/** Закрыть напоминание. Чужие закрыть нельзя - это проверяет действие. */
export function CompleteReminderButton({ reminderId }: { reminderId: number }) {
  const [state, action, pending] = useActionState(completeReminder, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="reminderId" value={reminderId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded border border-warn/40 px-2.5 py-1 font-display text-[0.6rem] tracking-wider text-warn hover:bg-warn/10 disabled:opacity-60"
      >
        <Check className="size-3" aria-hidden />
        {pending ? "ЗАКРЫВАЮ…" : "СДЕЛАНО"}
      </button>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
