"use client";

import { useActionState, useEffect, useRef } from "react";
import { SendHorizonal } from "lucide-react";
import { sendOrderMessage, type ActionState } from "@/app/actions/client";

const initial: ActionState = { ok: false };

/** Форма отправки сообщения по заказу. */
export function ChatForm({ orderId }: { orderId: number }) {
  const [state, action, pending] = useActionState(sendOrderMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // После удачной отправки поле нужно очистить: иначе отправленный текст
  // остаётся в нём и легко уходит вторым таким же сообщением
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="orderId" value={orderId} />

      <label htmlFor={`msg-${orderId}`} className="sr-only">
        Сообщение по заказу
      </label>
      <textarea
        id={`msg-${orderId}`}
        name="message"
        rows={3}
        maxLength={4000}
        required
        placeholder="Напишите вопрос по заказу…"
        className="w-full resize-y rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
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
