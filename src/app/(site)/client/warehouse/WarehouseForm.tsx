"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Check, TriangleAlert, X } from "lucide-react";
import { saveWarehouseItem, type ActionState } from "@/app/actions/client";
import { cn } from "@/lib/cn";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: ActionState = { ok: false };

export type WarehouseDraft = {
  id: number;
  name: string;
  description: string;
  quantity: number;
};

/**
 * Добавление и правка позиции мини-склада.
 *
 * Одна форма на оба случая: скрытое поле с номером решает, вставка это
 * или обновление. Отдельная форма редактирования на каждую строку
 * раздувала бы страницу вчетверо ради тех же трёх полей.
 */
export function WarehouseForm({ editing }: { editing?: WarehouseDraft }) {
  const [state, action, pending] = useActionState(saveWarehouseItem, initial);
  const [open, setOpen] = useState(Boolean(editing));
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !editing) formRef.current?.reset();
  }, [state, editing]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright"
      >
        <Plus className="size-4" aria-hidden />
        ДОБАВИТЬ ПОЗИЦИЮ
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-card border border-ink/10 bg-bone/85 p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">
          {editing ? "Изменить позицию" : "Новая позиция"}
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Свернуть форму"
            className="rounded-pill p-1.5 text-ink/40 hover:bg-ink/6 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {editing && <input type="hidden" name="itemId" value={editing.id} />}

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wh-name" className={labelClass}>
            ЧТО ЛЕЖИТ
          </label>
          <input
            id="wh-name"
            name="name"
            required
            maxLength={255}
            defaultValue={editing?.name}
            placeholder="Например: футболки XL, белые"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wh-qty" className={labelClass}>
            КОЛИЧЕСТВО
          </label>
          <input
            id="wh-qty"
            name="quantity"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={editing?.quantity ?? 1}
            className={cn(inputClass, "font-mono tabular-nums")}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="wh-desc" className={labelClass}>
            ПРИМЕЧАНИЕ
          </label>
          <textarea
            id="wh-desc"
            name="description"
            rows={2}
            defaultValue={editing?.description}
            placeholder="Размер, цвет, где хранить - что важно не забыть"
            className={cn(inputClass, "resize-y")}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
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

const labelClass = siteLabelClass;
const inputClass = siteInputClass;
