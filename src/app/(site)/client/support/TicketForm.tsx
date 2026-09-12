"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, TriangleAlert, MessageSquarePlus, X } from "lucide-react";
import { createTicket, type ActionState } from "@/app/actions/client";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/client-portal";
import { cn } from "@/lib/cn";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: ActionState = { ok: false };

export type TicketOrderOption = { id: number; label: string };

/** Новое обращение в поддержку. */
export function TicketForm({
  orders,
  defaultOrderId,
  startOpen,
}: {
  orders: TicketOrderOption[];
  defaultOrderId?: number;
  startOpen?: boolean;
}) {
  const [state, action, pending] = useActionState(createTicket, initial);
  const [open, setOpen] = useState(Boolean(startOpen));
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright"
      >
        <MessageSquarePlus className="size-4" aria-hidden />
        НОВОЕ ОБРАЩЕНИЕ
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="w-full rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Новое обращение</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть форму"
          className="rounded-pill p-1.5 text-ink/40 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="subject" className={labelClass}>
            ТЕМА
          </label>
          <input
            id="subject"
            name="subject"
            required
            maxLength={255}
            placeholder="Коротко о сути"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className={labelClass}>
            О ЧЁМ ВОПРОС
          </label>
          <select id="category" name="category" defaultValue="general" className={inputClass}>
            {Object.entries(TICKET_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="priority" className={labelClass}>
            НАСКОЛЬКО СРОЧНО
          </label>
          <select id="priority" name="priority" defaultValue="normal" className={inputClass}>
            {Object.entries(TICKET_PRIORITIES).map(([value, p]) => (
              <option key={value} value={value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ticketOrder" className={labelClass}>
            ПО КАКОМУ ЗАКАЗУ
          </label>
          <select
            id="ticketOrder"
            name="orderId"
            defaultValue={defaultOrderId ? String(defaultOrderId) : ""}
            className={inputClass}
          >
            <option value="">Вопрос не о заказе</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ticketMessage" className={labelClass}>
            ЧТО СЛУЧИЛОСЬ
          </label>
          <textarea
            id="ticketMessage"
            name="message"
            rows={5}
            required
            placeholder="Опишите подробно - так ответим с первого раза, без уточняющих писем"
            className={cn(inputClass, "resize-y")}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ОТПРАВЛЯЮ…" : "ОТПРАВИТЬ"}
        </button>

        {state.message && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm",
              state.ok ? "text-ok" : "text-danger",
            )}
            role="status"
          >
            {state.ok ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <TriangleAlert className="size-4" aria-hidden />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const labelClass = siteLabelClass;
const inputClass = siteInputClass;
