"use client";

import { useEffect, useRef } from "react";
import { useLatestActionState } from "@/components/admin/useLatestActionState";
import { Send } from "lucide-react";
import { replyToOrderChat, type ChatState } from "../actions";
import type { ChatMessage } from "@/lib/order-chat";
import { cn } from "@/lib/cn";

const initial: ChatState = { ok: false };

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Переписка по заказу в админке.
 *
 * Раньше её тут не было вовсе: клиент писал, а менеджер узнавал об этом
 * только из телеграма - и ответить всё равно не мог.
 */
export function OrderChat({
  orderId,
  messages,
  canReply,
}: {
  orderId: number;
  messages: ChatMessage[];
  canReply: boolean;
}) {
  const [state, action, pending] = useLatestActionState(replyToOrderChat, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-ink/10 bg-bone">
      <header className="border-b border-ink/10 px-5 py-3">
        <h2 className="font-display text-base text-ink">Переписка по заказу</h2>
      </header>

      {messages.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink/50">
          Сообщений нет. Всё, что напишете здесь, клиент увидит в кабинете.
        </p>
      ) : (
        <ol className="flex flex-col gap-3 px-5 py-4">
          {messages.map((m) => {
            const staff = m.authorRole === "admin" || m.authorRole === "manager";
            return (
              <li
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-2.5 text-sm",
                  staff ? "ml-auto bg-brand/10 text-ink" : "bg-paper text-ink",
                )}
              >
                <p className="whitespace-pre-line">{m.message}</p>
                <p className="mt-1 font-mono text-[0.68rem] text-ink/40">
                  {m.authorName}
                  {m.createdAt && ` · ${dt.format(m.createdAt)}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {canReply && (
        <form
          ref={formRef}
          action={action}
          className="flex flex-col gap-2 border-t border-ink/10 px-5 py-4"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <label htmlFor={`reply-${orderId}`} className="sr-only">
            Ответ клиенту
          </label>
          <textarea
            id={`reply-${orderId}`}
            name="message"
            rows={3}
            maxLength={4000}
            placeholder="Ответить клиенту"
            className="w-full resize-y rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
            >
              <Send className="size-3.5" aria-hidden />
              {pending ? "ОТПРАВЛЯЮ…" : "ОТПРАВИТЬ"}
            </button>
            {state.message && (
              <span
                className={cn("text-sm", state.ok ? "text-ok" : "text-danger")}
                role="status"
              >
                {state.message}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
