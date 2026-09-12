"use client";

import { useActionState, useState } from "react";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import {
  deleteSupplier,
  saveSupplier,
  type SupplierState,
} from "@/app/actions/suppliers";
import { cn } from "@/lib/cn";

const initial: SupplierState = {};

export type SupplierValues = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  isActive: boolean | null;
};

/** Карточка подрядчика - она же форма заведения нового. */
export function SupplierForm({ value }: { value?: SupplierValues }) {
  const [state, action, pending] = useActionState(saveSupplier, initial);
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
            placeholder="Резон, UF DTF наклейки, широкоформат"
            className={input(err.name)}
          />
        </Field>

        <Field label="КОНТАКТНОЕ ЛИЦО" error={err.contactPerson}>
          <input
            name="contactPerson"
            defaultValue={value?.contactPerson ?? ""}
            maxLength={255}
            className={input(err.contactPerson)}
          />
        </Field>

        <Field label="ТЕЛЕФОН" error={err.phone}>
          <input
            name="phone"
            defaultValue={value?.phone ?? ""}
            maxLength={50}
            className={input(err.phone)}
          />
        </Field>

        <Field label="ПОЧТА" error={err.email}>
          <input
            name="email"
            type="email"
            defaultValue={value?.email ?? ""}
            maxLength={100}
            className={input(err.email)}
          />
        </Field>

        <Field label="САЙТ" error={err.website}>
          <input
            name="website"
            defaultValue={value?.website ?? ""}
            maxLength={255}
            placeholder="rezon59.ru"
            className={input(err.website)}
          />
        </Field>

        <Field label="АДРЕС" error={err.address} span>
          <input
            name="address"
            defaultValue={value?.address ?? ""}
            maxLength={1000}
            className={input(err.address)}
          />
        </Field>

        <Field label="УСЛОВИЯ ОПЛАТЫ" error={err.paymentTerms}>
          <input
            name="paymentTerms"
            defaultValue={value?.paymentTerms ?? ""}
            maxLength={1000}
            placeholder="Постоплата 5 дней"
            className={input(err.paymentTerms)}
          />
        </Field>

        <Field label="УСЛОВИЯ ДОСТАВКИ" error={err.deliveryTerms}>
          <input
            name="deliveryTerms"
            defaultValue={value?.deliveryTerms ?? ""}
            maxLength={1000}
            placeholder="Самовывоз, доставка от 5000 ₽"
            className={input(err.deliveryTerms)}
          />
        </Field>

        <Field label="ЗАМЕТКИ" error={err.notes} span>
          <textarea
            name="notes"
            rows={2}
            defaultValue={value?.notes ?? ""}
            maxLength={2000}
            placeholder="Что у него берут, как быстро отвечает, о чём договорились"
            className={cn(input(err.notes), "resize-y")}
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
          <span className="block text-sm text-ink">Работаем с ним</span>
          <span className="block text-xs text-ink/50">
            Выключенный не предлагается ни в закупке, ни при перезаказе, но
            остаётся в старых заказах
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : value ? "СОХРАНИТЬ" : "ЗАВЕСТИ ПОДРЯДЧИКА"}
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

/** Удаление - только пока за подрядчиком ничего не числится. */
export function DeleteSupplierButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState(deleteSupplier, initial);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/50 hover:border-danger/40 hover:text-danger"
      >
        <Trash2 className="size-3.5" aria-hidden />
        УДАЛИТЬ
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-danger px-4 py-2 font-display text-xs tracking-wider text-bone hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "УДАЛЯЮ…" : "ДА, УДАЛИТЬ"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink"
        >
          ОТМЕНА
        </button>
      </div>
      {state.error && (
        <span className="text-xs text-danger" role="status">
          {state.error}
        </span>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  span,
  children,
}: {
  label: string;
  error?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", span && "sm:col-span-2")}>
      <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
        {label}
      </span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

const input = (error?: string) =>
  cn(
    "w-full rounded-lg border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35",
    "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
    error ? "border-danger" : "border-ink/15 hover:border-ink/30",
  );
