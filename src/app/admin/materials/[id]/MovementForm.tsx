"use client";

import { useActionState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, TriangleAlert } from "lucide-react";
import { recordMovement, type MovementState } from "../actions";
import { cn } from "@/lib/cn";

export function MovementForm({
  materialId,
  unit,
}: {
  materialId: number;
  unit: string;
}) {
  const [state, action, pending] = useActionState<MovementState, FormData>(
    recordMovement,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="materialId" value={materialId} />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      )}

      <fieldset className="border-0 p-0">
        <legend className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
          Тип движения
        </legend>
        <div className="mt-2 flex gap-2">
          <TypeOption value="in" label="Приход" icon={ArrowDownToLine} defaultChecked />
          <TypeOption value="out" label="Расход" icon={ArrowUpFromLine} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="quantity"
          className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
        >
          Количество, {unit}
        </label>
        <input
          id="quantity"
          name="quantity"
          inputMode="decimal"
          required
          placeholder="0.00"
          className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="comment"
          className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
        >
          Комментарий
        </label>
        <input
          id="comment"
          name="comment"
          placeholder="Например: поступление от поставщика"
          className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/30 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2.5 text-sm text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
      >
        {pending ? "Записываем…" : "Записать движение"}
      </button>
    </form>
  );
}

function TypeOption({
  value,
  label,
  icon: Icon,
  defaultChecked,
}: {
  value: string;
  label: string;
  icon: React.ElementType;
  defaultChecked?: boolean;
}) {
  const id = `type-${value}`;
  return (
    <div className="flex-1">
      <input
        type="radio"
        id={id}
        name="type"
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors",
          "hover:border-brand/40",
          "peer-checked:border-brand peer-checked:bg-brand peer-checked:text-bone",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-bright",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </label>
    </div>
  );
}
