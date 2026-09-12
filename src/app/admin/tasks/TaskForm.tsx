"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { createTask, type TaskState } from "@/app/actions/tasks";
import { TASK_PRIORITY, type TaskPriority } from "@/lib/tasks";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: TaskState = { ok: false };

export type StaffOption = { id: number; name: string };

/**
 * Новая задача.
 *
 * Пункты добавляются по одному полю: в старой админке это был список
 * инпутов с одним именем, и здесь так же - на сервер уходит несколько
 * значений «items», которые собираются в список.
 */
export function TaskForm({ staff }: { staff: StaffOption[] }) {
  const [state, action, pending] = useActionState(createTask, initial);
  const [open, setOpen] = useState(false);
  const [itemCount, setItemCount] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);

  // reset() чистит поля сам; лишние пустые строки пунктов не мешают -
  // на сервер уходят только заполненные
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
        НОВАЯ ЗАДАЧА
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
        <h2 className="font-display text-base text-ink">Новая задача</h2>
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
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>НАЗВАНИЕ</span>
          <input
            name="title"
            required
            maxLength={255}
            placeholder="Например: забрать баннер из РЕЗОНа"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ОПИСАНИЕ</span>
          <textarea
            name="description"
            rows={2}
            placeholder="Подробности, если нужны"
            className={cn(inputClass, "resize-y")}
          />
        </label>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className={labelClass}>ПУНКТЫ</legend>
          {Array.from({ length: itemCount }, (_, i) => (
            <input
              key={i}
              name="items"
              maxLength={500}
              placeholder={i === 0 ? "Что конкретно сделать" : "Ещё пункт"}
              aria-label={`Пункт ${i + 1}`}
              className={inputClass}
            />
          ))}
          <button
            type="button"
            onClick={() => setItemCount((n) => Math.min(n + 1, 20))}
            className="self-start text-xs text-brand hover:text-brand-bright"
          >
            + добавить пункт
          </button>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ИСПОЛНИТЕЛЬ</span>
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
          <span className={labelClass}>ВАЖНОСТЬ</span>
          <select name="priority" defaultValue="medium" className={inputClass}>
            {(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((key) => (
              <option key={key} value={key}>
                {TASK_PRIORITY[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>СРОК</span>
          <input
            type="date"
            name="dueDate"
            className={cn(inputClass, "font-mono")}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОЗДАЮ…" : "СОЗДАТЬ"}
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
