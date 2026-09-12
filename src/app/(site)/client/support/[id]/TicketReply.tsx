"use client";

import { useActionState, useEffect, useRef } from "react";
import { SendHorizonal } from "lucide-react";
import { replyToTicket, type ActionState } from "@/app/actions/client";

const initial: ActionState = { ok: false };

/** Ответ в обращение. */
export function TicketReply({ ticketId }: { ticketId: number }) {
  const [state, action, pending] = useActionState(replyToTicket, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-card border border-ink/10 bg-bone/85 p-6"
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      <label
        htmlFor="reply"
        className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45"
      >
        ВАШ ОТВЕТ
      </label>
      <textarea
        id="reply"
        name="message"
        rows={4}
        required
        placeholder="Добавьте подробности или ответьте на вопрос менеджера…"
        className="mt-2 w-full resize-y rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {state.message ? (
          <span className="text-sm text-danger" role="status">
            {state.message}
          </span>
        ) : (
          <span />
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          <SendHorizonal className="size-4" aria-hidden />
          {pending ? "ОТПРАВЛЯЮ…" : "ОТПРАВИТЬ"}
        </button>
      </div>
    </form>
  );
}
