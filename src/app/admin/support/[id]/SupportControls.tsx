"use client";

import { useActionState, useRef, useState } from "react";
import { SendHorizonal, StickyNote } from "lucide-react";
import {
  setTicketStatus,
  assignTicket,
  replyToTicket,
  type SupportState,
} from "@/app/actions/support";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/client-portal";
import { cn } from "@/lib/cn";

const initial: SupportState = { ok: false };

export type StaffOption = { id: number; name: string };

/** Переключатель статуса обращения. */
export function StatusControls({
  ticketId,
  status,
}: {
  ticketId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setTicketStatus, initial);
  const current = status ?? "open";

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="ticketId" value={ticketId} />
      {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map((key) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="submit"
            name="status"
            value={key}
            disabled={pending || active}
            className={cn(
              "rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              active
                ? TICKET_STATUSES[key].className
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
              pending && "opacity-60",
            )}
          >
            {TICKET_STATUSES[key].label}
          </button>
        );
      })}
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Кто ведёт обращение. */
export function AssignControl({
  ticketId,
  assignedTo,
  staff,
}: {
  ticketId: number;
  assignedTo: number | null;
  staff: StaffOption[];
}) {
  const [state, action, pending] = useActionState(assignTicket, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={`assign-${ticketId}`} className="text-xs text-ink/45">
        Ведёт
      </label>
      <select
        id={`assign-${ticketId}`}
        name="assignedTo"
        defaultValue={assignedTo ? String(assignedTo) : ""}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border border-ink/12 bg-paper px-2 py-1 text-xs text-ink/70 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright disabled:opacity-60"
      >
        <option value="">никто</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/**
 * Ответ клиенту либо внутренняя заметка.
 *
 * Заметку от ответа отличает одна галочка, поэтому форма меняет вид при
 * её включении: перепутать эти две вещи дороже всего - заметка «клиент
 * невменяемый» уйдёт клиенту.
 */
export function ReplyForm({ ticketId }: { ticketId: number }) {
  const [state, action, pending] = useActionState(replyToTicket, initial);
  const [internal, setInternal] = useState(false);

  return (
    <form
      action={action}
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-5 py-4",
        internal ? "border-warn/35 bg-warn/8" : "border-ink/10 bg-bone",
      )}
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      <label htmlFor={`reply-${ticketId}`} className="sr-only">
        {internal ? "Внутренняя заметка" : "Ответ клиенту"}
      </label>
      <textarea
        id={`reply-${ticketId}`}
        name="message"
        rows={4}
        required
        placeholder={internal ? "Заметка для своих…" : "Ответ клиенту…"}
        className="w-full resize-y rounded-lg border border-ink/12 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/35 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink/65">
          <input
            type="checkbox"
            name="isInternal"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="size-4 accent-warn"
          />
          <StickyNote className="size-3.5 text-ink/40" aria-hidden />
          Внутренняя заметка - клиент её не увидит
        </label>

        <button
          type="submit"
          disabled={pending}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2 font-display text-xs tracking-wider text-bone disabled:opacity-60",
            internal ? "bg-warn hover:bg-warn/85" : "bg-brand hover:bg-brand-bright",
          )}
        >
          <SendHorizonal className="size-3.5" aria-hidden />
          {pending ? "ОТПРАВЛЯЮ…" : internal ? "СОХРАНИТЬ ЗАМЕТКУ" : "ОТВЕТИТЬ"}
        </button>
      </div>

      {state.message && (
        <span
          className={cn("text-sm", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
