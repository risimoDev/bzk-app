"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { savePromocode, type PromocodeState } from "@/app/actions/inbox";
import { cn } from "@/lib/cn";

const initial: PromocodeState = {};

export type PromoValues = {
  id: number;
  code: string;
  discountType: string | null;
  discountValue: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  usageLimit: number | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  isSingleUse: boolean;
  isActive: boolean | null;
};

/** Дата для input type="date" - местный календарный день, без сдвига. */
function dateValue(d: Date | null) {
  if (!d) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Промокод: заведение и правка.
 *
 * Счётчик применений формой не трогается - он копится сам, и обнулять
 * его вручную значило бы выдать заново уже потраченные разовые коды.
 */
export function PromoForm({ value }: { value?: PromoValues }) {
  const [state, action, pending] = useActionState(savePromocode, initial);
  const [open, setOpen] = useState(Boolean(value));
  const formRef = useRef<HTMLFormElement>(null);
  const err = state.fieldErrors ?? {};
  const isNew = !value;

  useEffect(() => {
    if (state.ok && isNew) formRef.current?.reset();
  }, [state, isNew]);

  if (isNew && !open) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
        >
          <Plus className="size-4" aria-hidden />
          НОВЫЙ ПРОМОКОД
        </button>
        {state.ok && state.message && (
          <span className="flex items-center gap-2 text-sm text-ok" role="status">
            <Check className="size-4" aria-hidden />
            {state.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-ink/10 bg-bone p-5"
    >
      {value && <input type="hidden" name="id" value={value.id} />}

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base text-ink">
          {isNew ? "Новый промокод" : `Код ${value.code}`}
        </h2>
        {isNew && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Свернуть форму"
            className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="КОД" error={err.code}>
          <input
            name="code"
            defaultValue={value?.code ?? ""}
            maxLength={50}
            placeholder="VESNA10"
            className={cn(input(err.code), "font-mono uppercase")}
          />
        </Field>

        <Field label="ТИП СКИДКИ">
          <select
            name="discountType"
            defaultValue={value?.discountType ?? "percentage"}
            className={input()}
          >
            <option value="percentage">Процент</option>
            <option value="fixed">Фиксированная сумма</option>
          </select>
        </Field>

        <Field label="РАЗМЕР" error={err.discountValue}>
          <input
            name="discountValue"
            defaultValue={value?.discountValue ?? ""}
            inputMode="decimal"
            placeholder="10"
            className={cn(input(err.discountValue), "font-mono")}
          />
        </Field>

        <Field label="ЛИМИТ ПРИМЕНЕНИЙ" error={err.usageLimit} hint="Пусто - без лимита">
          <input
            name="usageLimit"
            defaultValue={value?.usageLimit ?? ""}
            inputMode="numeric"
            className={cn(input(err.usageLimit), "font-mono")}
          />
        </Field>

        <Field label="ОТ СУММЫ ЗАКАЗА" error={err.minOrderAmount}>
          <input
            name="minOrderAmount"
            defaultValue={value?.minOrderAmount ?? ""}
            inputMode="decimal"
            className={cn(input(err.minOrderAmount), "font-mono")}
          />
        </Field>

        <Field label="СКИДКА НЕ БОЛЬШЕ" error={err.maxDiscountAmount}>
          <input
            name="maxDiscountAmount"
            defaultValue={value?.maxDiscountAmount ?? ""}
            inputMode="decimal"
            className={cn(input(err.maxDiscountAmount), "font-mono")}
          />
        </Field>

        <Field label="ДЕЙСТВУЕТ С">
          <input
            type="date"
            name="startDate"
            defaultValue={dateValue(value?.startDate ?? null)}
            className={cn(input(), "font-mono")}
          />
        </Field>

        <Field label="ПО">
          <input
            type="date"
            name="endDate"
            defaultValue={dateValue(value?.endDate ?? null)}
            className={cn(input(), "font-mono")}
          />
        </Field>

        <Field label="ОПИСАНИЕ" span>
          <input
            name="description"
            defaultValue={value?.description ?? ""}
            maxLength={1000}
            placeholder="Для кого код и по какому поводу"
            className={input()}
          />
        </Field>

        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink/75">
            <input
              type="checkbox"
              name="isSingleUse"
              defaultChecked={value?.isSingleUse ?? false}
              className="size-4 accent-brand"
            />
            Одноразовый
          </label>
          <label className="flex items-center gap-2 text-sm text-ink/75">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={value?.isActive ?? true}
              className="size-4 accent-brand"
            />
            Работает
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : isNew ? "ЗАВЕСТИ" : "СОХРАНИТЬ"}
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
