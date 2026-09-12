"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { createLead, type CrmState } from "@/app/actions/crm";
import {
  LEAD_SOURCE,
  LEAD_PRIORITY,
  type LeadSource,
  type LeadPriority,
} from "@/lib/crm";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: CrmState = { ok: false };

export type StaffOption = { id: number; name: string };

/** Новый лид: обращение, из которого ещё не вышел заказ. */
export function LeadForm({ staff }: { staff: StaffOption[] }) {
  const [state, action, pending] = useActionState(createLead, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
      >
        <Plus className="size-4" aria-hidden />
        НОВЫЙ ЛИД
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="w-full rounded-xl border border-ink/10 bg-bone p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base text-ink">Новый лид</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть форму"
          className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ИМЯ ИЛИ КОМПАНИЯ</span>
          <input name="name" required maxLength={255} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ОРГАНИЗАЦИЯ</span>
          <input
            name="company"
            maxLength={255}
            placeholder="Если отличается от имени"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ПОЧТА</span>
          <input name="email" type="email" maxLength={255} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ТЕЛЕФОН</span>
          <input name="phone" type="tel" maxLength={50} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ОТКУДА ПРИШЁЛ</span>
          <select name="source" defaultValue="website" className={inputClass}>
            {(Object.keys(LEAD_SOURCE) as LeadSource[]).map((key) => (
              <option key={key} value={key}>
                {LEAD_SOURCE[key]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ВАЖНОСТЬ</span>
          <select name="priority" defaultValue="medium" className={inputClass}>
            {(Object.keys(LEAD_PRIORITY) as LeadPriority[]).map((key) => (
              <option key={key} value={key}>
                {LEAD_PRIORITY[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ОЖИДАЕМАЯ СУММА, ₽</span>
          <input
            name="expectedRevenue"
            inputMode="decimal"
            placeholder="Например: 45000"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЖДЁМ РЕШЕНИЯ К</span>
          <input
            type="date"
            name="expectedCloseDate"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ОТВЕТСТВЕННЫЙ</span>
          <select name="assignedTo" defaultValue="" className={inputClass}>
            <option value="">Не назначен</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>МЕТКИ</span>
          <input
            name="tags"
            maxLength={500}
            placeholder="через запятую: сувенирка, крупный"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ЗАМЕТКИ</span>
          <textarea
            name="notes"
            rows={2}
            placeholder="Что нужно клиенту, о чём договорились"
            className={cn(inputClass, "resize-y")}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "СОЗДАТЬ"}
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

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
