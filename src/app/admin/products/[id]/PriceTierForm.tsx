"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  deletePriceTier,
  savePriceTier,
  type CatalogState,
} from "@/app/actions/catalogs";
import { cn } from "@/lib/cn";

const initial: CatalogState = {};

export type TierValues = {
  id: number;
  minQty: number;
  maxQty: number | null;
  price: string;
};

/**
 * Ступень цены по тиражу.
 *
 * Верхняя граница необязательна: пустая означает «и дальше». Цену
 * выбирает последняя подходящая ступень - так же считает и корзина.
 */
export function PriceTierForm({
  productId,
  value,
}: {
  productId: number;
  value?: TierValues;
}) {
  const [state, action, pending] = useActionState(savePriceTier, initial);
  const [del, deleteAction, deleting] = useActionState(deletePriceTier, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <div className="flex flex-col gap-1.5 border-b border-ink/6 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <form ref={formRef} action={action} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          {value && <input type="hidden" name="id" value={value.id} />}

          <label className="flex items-center gap-1.5 text-xs text-ink/50">
            от
            <input
              name="minQty"
              defaultValue={value?.minQty ?? ""}
              inputMode="numeric"
              aria-label="Тираж от"
              className={cn(field, "w-20", state.fieldErrors?.minQty && "border-danger")}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ink/50">
            до
            <input
              name="maxQty"
              defaultValue={value?.maxQty ?? ""}
              inputMode="numeric"
              placeholder="∞"
              aria-label="Тираж до"
              className={cn(field, "w-20", state.fieldErrors?.maxQty && "border-danger")}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ink/50">
            ₽/ед.
            <input
              name="price"
              defaultValue={value?.price ?? ""}
              inputMode="decimal"
              aria-label="Цена за единицу"
              className={cn(field, "w-24", state.fieldErrors?.price && "border-danger")}
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/60 hover:border-brand/40 hover:text-brand disabled:opacity-50"
          >
            {pending ? "…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
          </button>
        </form>

        {value && (
          <form action={deleteAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="id" value={value.id} />
            <ConfirmButton
              title={`Удалить ступень от ${value.minQty} шт.?`}
              text="Для этого тиража снова будет действовать соседняя ступень или базовая цена."
              disabled={deleting}
              ariaLabel="Удалить ступень"
              className="rounded p-1.5 text-ink/30 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </ConfirmButton>
          </form>
        )}
      </div>

      {(state.message || state.error || del.error) && (
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            state.ok ? "text-ok" : "text-danger",
          )}
          role="status"
        >
          {state.ok ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <TriangleAlert className="size-3.5" aria-hidden />
          )}
          {del.error ?? state.message ?? state.error}
        </span>
      )}

      {(state.fieldErrors?.minQty || state.fieldErrors?.maxQty || state.fieldErrors?.price) && (
        <span className="text-xs text-danger">
          {state.fieldErrors.minQty ?? state.fieldErrors.maxQty ?? state.fieldErrors.price}
        </span>
      )}
    </div>
  );
}

const field =
  "rounded-lg border border-ink/15 bg-paper px-2 py-1.5 font-mono text-sm text-ink placeholder:text-ink/30 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";
