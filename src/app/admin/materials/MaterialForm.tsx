"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { saveMaterial, type MaterialState } from "./actions";
import { CATEGORY, type MaterialCategory } from "@/lib/materials";
import { cn } from "@/lib/cn";

const initial: MaterialState = {};

export type MaterialValues = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: string | null;
  minStock: string | null;
  description: string | null;
  category: string | null;
  materialType: string | null;
  supplier: string | null;
  widthMm: string | null;
  heightMm: string | null;
  isActive: boolean | null;
};

/** Тип материала определяет, как считается раскрой листа. */
const MATERIAL_TYPE = {
  sheet: "Лист",
  roll: "Рулон",
  piece: "Штука",
  liquid: "Жидкость",
} as const;

/**
 * Карточка материала - она же форма заведения нового.
 *
 * Размеры нужны раскрою: без ширины и высоты калькулятор не посчитает,
 * сколько изделий выходит с листа.
 */
export function MaterialForm({ value }: { value?: MaterialValues }) {
  const [state, action, pending] = useActionState(saveMaterial, initial);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      {value && <input type="hidden" name="id" value={value.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="НАЗВАНИЕ" error={err.name} span>
          <input
            name="name"
            defaultValue={value?.name ?? ""}
            maxLength={255}
            placeholder="Бумага мелованная 150 г, SRA3"
            className={input(err.name)}
          />
        </Field>

        <Field label="ЕДИНИЦА ИЗМЕРЕНИЯ" error={err.unit}>
          <input
            name="unit"
            defaultValue={value?.unit ?? "шт."}
            maxLength={50}
            className={input(err.unit)}
          />
        </Field>

        <Field label="ЦЕНА ЗА ЕДИНИЦУ, ₽" error={err.costPerUnit}>
          <input
            name="costPerUnit"
            defaultValue={value?.costPerUnit ?? ""}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(input(err.costPerUnit), "font-mono")}
          />
        </Field>

        <Field label="КАТЕГОРИЯ" error={err.category}>
          <select
            name="category"
            defaultValue={value?.category ?? "other"}
            className={input(err.category)}
          >
            {(Object.keys(CATEGORY) as MaterialCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ТИП" error={err.materialType}>
          <select
            name="materialType"
            defaultValue={value?.materialType ?? "sheet"}
            className={input(err.materialType)}
          >
            {(Object.keys(MATERIAL_TYPE) as (keyof typeof MATERIAL_TYPE)[]).map((key) => (
              <option key={key} value={key}>
                {MATERIAL_TYPE[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="МИНИМАЛЬНЫЙ ОСТАТОК"
          error={err.minStock}
          hint="Ниже этого числа склад подсветит нехватку"
        >
          <input
            name="minStock"
            defaultValue={value?.minStock ?? "0"}
            inputMode="decimal"
            className={cn(input(err.minStock), "font-mono")}
          />
        </Field>

        <Field label="ПОСТАВЩИК" error={err.supplier}>
          <input
            name="supplier"
            defaultValue={value?.supplier ?? ""}
            maxLength={255}
            className={input(err.supplier)}
          />
        </Field>

        <Field label="ШИРИНА, ММ" error={err.widthMm} hint="Для раскроя листа">
          <input
            name="widthMm"
            defaultValue={value?.widthMm ?? ""}
            inputMode="decimal"
            placeholder="320"
            className={cn(input(err.widthMm), "font-mono")}
          />
        </Field>

        <Field label="ВЫСОТА ИЛИ ДЛИНА, ММ" error={err.heightMm}>
          <input
            name="heightMm"
            defaultValue={value?.heightMm ?? ""}
            inputMode="decimal"
            placeholder="450"
            className={cn(input(err.heightMm), "font-mono")}
          />
        </Field>

        <Field label="ОПИСАНИЕ" error={err.description} span>
          <textarea
            name="description"
            rows={2}
            defaultValue={value?.description ?? ""}
            maxLength={2000}
            className={cn(input(err.description), "resize-y")}
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={value?.isActive ?? true}
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
        <span>
          <span className="block text-sm text-ink">Доступен в калькуляторе</span>
          <span className="block text-xs text-ink/50">
            Выключенный материал остаётся на складе, но в расчёте не предлагается
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : value ? "СОХРАНИТЬ" : "ЗАВЕСТИ МАТЕРИАЛ"}
        </button>

        {(state.message || state.error) && (
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
            {state.message ?? state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  span,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", span && "sm:col-span-2")}>
      <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink/45">{hint}</span>
      ) : null}
    </label>
  );
}

const input = (error?: string) =>
  cn(
    "w-full rounded-lg border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35",
    "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
    error ? "border-danger" : "border-ink/15 hover:border-ink/30",
  );
