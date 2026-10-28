"use client";

import { useEffect, useRef, useState } from "react";
import { useLatestActionState } from "@/components/admin/useLatestActionState";
import { Check, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  addExpense,
  addGeneralExpense,
  addPayment,
  deleteExpense,
  deleteGeneralExpense,
  deletePayment,
  type FinanceState,
} from "@/app/actions/finance";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: FinanceState = {};

export type CategoryOption = { id: number; name: string };

/**
 * Формы бухгалтерии.
 *
 * Все три - расход по заказу, платёж и общий расход - устроены
 * одинаково: свёрнутая кнопка, поля, сообщение. Раскрытая форма в
 * разделе, куда заходят посмотреть цифры, только мешает.
 */
function Collapsible({
  label,
  title,
  children,
  message,
  ok,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
  message?: string;
  ok?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand"
        >
          <Plus className="size-3.5" aria-hidden />
          {label}
        </button>
        {ok && message && (
          <span className="flex items-center gap-2 text-sm text-ok" role="status">
            <Check className="size-4" aria-hidden />
            {message}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-bone p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base text-ink">{title}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть форму"
          className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function ExpenseForm({
  cardId,
  categories,
}: {
  cardId: number;
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useLatestActionState(addExpense, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Collapsible
      label="ДОБАВИТЬ РАСХОД"
      title="Новый расход по заказу"
      message={state.message}
      ok={state.ok}
    >
      <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="cardId" value={cardId} />

        <Field label="СУММА, ₽" error={state.fieldErrors?.amount}>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="ДАТА">
          <input type="date" name="expenseDate" className={cn(inputClass, "font-mono")} />
        </Field>

        <Field label="ЗА ЧТО" error={state.fieldErrors?.description}>
          <input
            name="description"
            maxLength={1000}
            placeholder="Печать у подрядчика, доставка, материал"
            className={inputClass}
          />
        </Field>

        <Field label="СТАТЬЯ">
          <select name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Без статьи</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Submit pending={pending} state={state} label="ЗАПИСАТЬ РАСХОД" />
      </form>
    </Collapsible>
  );
}

export function PaymentForm({ cardId }: { cardId: number }) {
  const [state, action, pending] = useLatestActionState(addPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Collapsible
      label="ОТМЕТИТЬ ОПЛАТУ"
      title="Новый платёж"
      message={state.message}
      ok={state.ok}
    >
      <form ref={formRef} action={action} className="grid gap-4">
        <input type="hidden" name="cardId" value={cardId} />

        <Field label="СУММА, ₽" error={state.fieldErrors?.amount}>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="ДАТА">
          <input type="date" name="paymentDate" className={cn(inputClass, "font-mono")} />
        </Field>

        <Field label="ЗАМЕТКА">
          <input
            name="note"
            maxLength={1000}
            placeholder="Наличными, на счёт, часть суммы"
            className={inputClass}
          />
        </Field>

        <Submit pending={pending} state={state} label="ЗАПИСАТЬ ПЛАТЁЖ" />
      </form>
    </Collapsible>
  );
}

export function GeneralExpenseForm({ categories }: { categories: CategoryOption[] }) {
  const [state, action, pending] = useLatestActionState(addGeneralExpense, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Collapsible
      label="ОБЩИЙ РАСХОД"
      title="Расход, не отнесённый на заказ"
      message={state.message}
      ok={state.ok}
    >
      <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label="СУММА, ₽" error={state.fieldErrors?.amount}>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="ДАТА">
          <input type="date" name="expenseDate" className={cn(inputClass, "font-mono")} />
        </Field>

        <Field label="ЗА ЧТО" error={state.fieldErrors?.description}>
          <input
            name="description"
            maxLength={1000}
            placeholder="Аренда, связь, реклама"
            className={inputClass}
          />
        </Field>

        <Field label="СТАТЬЯ">
          <select name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Без статьи</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Submit pending={pending} state={state} label="ЗАПИСАТЬ" />
      </form>
    </Collapsible>
  );
}

/**
 * Что сказать перед удалением. У платежа и расхода последствия разные:
 * один меняет статус оплаты, другой - маржу, и об этом стоит предупредить.
 */
const DELETE_TEXT = {
  expense: {
    title: "Удалить расход?",
    text: "Себестоимость и маржа заказа пересчитаются.",
  },
  payment: {
    title: "Удалить платёж?",
    text: "Статус оплаты заказа пересчитается - заказ может снова стать неоплаченным.",
  },
  general: {
    title: "Удалить общий расход?",
    text: "Запись пропадёт из общих расходов и из аналитики.",
  },
} as const;

/** Удаление строки: расхода, платежа или общего расхода. */
export function DeleteRow({
  kind,
  cardId,
  rowId,
}: {
  kind: "expense" | "payment" | "general";
  cardId?: number;
  rowId: number;
}) {
  const fn =
    kind === "expense" ? deleteExpense : kind === "payment" ? deletePayment : deleteGeneralExpense;
  const [state, action, pending] = useLatestActionState(fn, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      {cardId !== undefined && <input type="hidden" name="cardId" value={cardId} />}
      <input
        type="hidden"
        name={kind === "expense" ? "expenseId" : kind === "payment" ? "paymentId" : "id"}
        value={rowId}
      />
      <ConfirmButton
        title={DELETE_TEXT[kind].title}
        text={DELETE_TEXT[kind].text}
        disabled={pending}
        ariaLabel="Удалить"
        hint="Удалить"
        className="rounded p-1 text-ink/30 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </ConfirmButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

function Submit({
  pending,
  state,
  label,
}: {
  pending: boolean;
  state: FinanceState;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
      >
        {pending ? "СОХРАНЯЮ…" : label}
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
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
