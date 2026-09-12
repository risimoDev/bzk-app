"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, TriangleAlert, Trash2, X } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  saveChecklistItem,
  deleteChecklistItem,
  type QcState,
} from "@/app/actions/quality";
import { cn } from "@/lib/cn";
import { adminInputOnPaperClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: QcState = { ok: false };

export type ItemDraft = {
  id: number;
  text: string;
  description: string;
  isCritical: boolean;
  sortOrder: number;
};

/**
 * Правка пункта чек-листа. Одна форма и на добавление, и на изменение -
 * скрытое поле с номером решает, что именно происходит.
 */
export function ChecklistItemForm({
  checklistId,
  editing,
  nextSortOrder,
  onDone,
}: {
  checklistId: number;
  editing?: ItemDraft;
  nextSortOrder?: number;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveChecklistItem, initial);
  const [open, setOpen] = useState(Boolean(editing));
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) onDone?.();
    else formRef.current?.reset();
  }, [state, editing, onDone]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
      >
        <Plus className="size-4" aria-hidden />
        ДОБАВИТЬ ПУНКТ
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-ink/10 bg-paper p-5"
    >
      <input type="hidden" name="checklistId" value={checklistId} />
      {editing && <input type="hidden" name="itemId" value={editing.id} />}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm text-ink">
          {editing ? "Изменить пункт" : "Новый пункт"}
        </h3>
        <button
          type="button"
          onClick={() => (editing ? onDone?.() : setOpen(false))}
          aria-label="Свернуть форму"
          className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_6rem]">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ЧТО ПРОВЕРЯЕМ</span>
          <input
            name="text"
            required
            maxLength={500}
            defaultValue={editing?.text}
            placeholder="Например: приводка в норме (±0.1 мм)"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>КРИТЕРИИ</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={editing?.description}
            placeholder="Как понять, что пункт пройден"
            className={cn(inputClass, "resize-y")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ПОРЯДОК</span>
          <input
            name="sortOrder"
            type="number"
            defaultValue={editing?.sortOrder ?? nextSortOrder ?? 0}
            className={cn(inputClass, "font-mono tabular-nums")}
          />
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="isCritical"
          defaultChecked={editing?.isCritical}
          className="mt-0.5 size-4 accent-danger"
        />
        <span>
          Критический
          <span className="block text-xs text-ink/50">
            Непройденный критический пункт делает всю проверку браком, а не замечанием
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
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

/** Кнопка удаления пункта. */
export function DeleteItemButton({
  itemId,
  checklistId,
}: {
  itemId: number;
  checklistId: number;
}) {
  const [state, action, pending] = useActionState(deleteChecklistItem, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="checklistId" value={checklistId} />
      <ConfirmButton
        title="Удалить пункт чек-листа?"
        text="Пункт пропадёт из чек-листа для следующих проверок."
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
        {pending ? "Удаляю…" : "Удалить"}
      </ConfirmButton>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputOnPaperClass;
