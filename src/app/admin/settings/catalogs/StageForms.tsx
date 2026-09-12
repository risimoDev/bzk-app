"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { saveProductionStage, type StageState } from "@/app/actions/production-stages";
import { cn } from "@/lib/cn";
import { adminInlineInputClass } from "@/components/ui/form-classes";

const initial: StageState = {};

export type StageValue = {
  id: number;
  name: string;
  description: string | null;
  defaultDurationHours: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
  used: number;
};

/**
 * Этап производства в справочнике: название, порядок, часы, включённость.
 *
 * Кнопки удаления нет: по пройденному этапу хранится история заказов.
 * Выключенный этап остаётся в списке бледным, чтобы его можно было
 * вернуть.
 */
export function StageRow({ value }: { value?: StageValue }) {
  const [state, action, pending] = useActionState(saveProductionStage, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <form
      ref={formRef}
      action={action}
      className={cn(
        "flex flex-col gap-2 border-b border-ink/6 px-4 py-3 last:border-0",
        value && value.isActive === false && "opacity-60",
      )}
    >
      {value && <input type="hidden" name="id" value={value.id} />}
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="sortOrder"
          defaultValue={value?.sortOrder ?? 0}
          inputMode="numeric"
          aria-label="Порядок в цепочке"
          title="Порядок в цепочке"
          className={cn(inputClass, "w-16 font-mono", err.sortOrder && "border-danger")}
        />
        <input
          name="name"
          defaultValue={value?.name ?? ""}
          maxLength={255}
          placeholder="Название этапа"
          aria-label="Название этапа"
          className={cn(inputClass, "min-w-40 flex-1", err.name && "border-danger")}
        />
        <label className="flex items-center gap-1.5 text-xs text-ink/65">
          <input
            name="defaultDurationHours"
            defaultValue={value ? Number(value.defaultDurationHours ?? 0) || "" : ""}
            inputMode="decimal"
            placeholder="0"
            aria-label="Нормативное время, часов"
            className={cn(inputClass, "w-16 font-mono", err.defaultDurationHours && "border-danger")}
          />
          ч
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink/65">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={value?.isActive ?? true}
            className="size-3.5 accent-brand"
          />
          включён
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="description"
          defaultValue={value?.description ?? ""}
          maxLength={1000}
          placeholder="Что делают на этапе - видно на доске производства"
          aria-label="Описание этапа"
          className={cn(inputClass, "min-w-48 flex-1 text-xs")}
        />
        {value && (
          <span className="font-mono text-[0.68rem] text-ink/40" title="Сколько раз этап проходили заказы">
            в заказах: {value.used}
          </span>
        )}
        <button type="submit" disabled={pending} className={saveClass}>
          {pending ? "…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
        </button>
        {(state.error || (state.ok && state.message)) && (
          <span
            role="status"
            className={cn("flex items-center gap-1.5 text-xs", state.ok ? "text-ok" : "text-danger")}
          >
            {state.ok ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <TriangleAlert className="size-3.5" aria-hidden />
            )}
            {state.ok ? state.message : state.error}
          </span>
        )}
      </div>
    </form>
  );
}

const inputClass = adminInlineInputClass;
const saveClass =
  "rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/60 hover:border-brand/40 hover:text-brand disabled:opacity-50";
