"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import {
  saveCounterparty,
  type CounterpartyState,
} from "@/app/actions/counterparties";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: CounterpartyState = {};

export type CounterpartyValues = {
  id: number;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  inn: string | null;
  address: string | null;
  notes: string | null;
};

/**
 * Карточка контрагента - она же форма заведения нового.
 *
 * Новый заводится из свёрнутой кнопки: список контрагентов открывают,
 * чтобы найти нужного, а не чтобы каждый раз смотреть на пустую форму.
 */
export function CounterpartyForm({ value }: { value?: CounterpartyValues }) {
  const [state, action, pending] = useActionState(saveCounterparty, initial);
  const [open, setOpen] = useState(Boolean(value));
  const formRef = useRef<HTMLFormElement>(null);

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
          НОВЫЙ КОНТРАГЕНТ
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
          {isNew ? "Новый контрагент" : "Данные контрагента"}
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="ИМЯ ИЛИ КОНТАКТНОЕ ЛИЦО"
          name="name"
          required
          defaultValue={value?.name}
          placeholder="Иван Петров"
          error={state.fieldErrors?.name}
        />
        <Field
          label="ОРГАНИЗАЦИЯ"
          name="companyName"
          defaultValue={value?.companyName ?? ""}
          placeholder="ООО «Ромашка», если есть"
          error={state.fieldErrors?.companyName}
        />
        <Field
          label="ТЕЛЕФОН"
          name="phone"
          defaultValue={value?.phone ?? ""}
          placeholder="+7 (902) 000-00-00"
          error={state.fieldErrors?.phone}
        />
        <Field
          label="ПОЧТА"
          name="email"
          type="email"
          defaultValue={value?.email ?? ""}
          placeholder="client@example.com"
          error={state.fieldErrors?.email}
        />
        <Field
          label="ИНН"
          name="inn"
          defaultValue={value?.inn ?? ""}
          placeholder="10 или 12 цифр"
          error={state.fieldErrors?.inn}
        />
        <Field
          label="АДРЕС"
          name="address"
          defaultValue={value?.address ?? ""}
          placeholder="Куда возить"
          error={state.fieldErrors?.address}
        />

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ЗАМЕТКИ</span>
          <textarea
            name="notes"
            rows={2}
            defaultValue={value?.notes ?? ""}
            maxLength={2000}
            placeholder="Как работать с этим заказчиком, о чём договорились"
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
  name,
  error,
  ...rest
}: {
  label: string;
  name: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        className={cn(inputClass, error && "border-danger")}
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
