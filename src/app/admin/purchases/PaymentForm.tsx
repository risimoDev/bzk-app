"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Banknote, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { adminInputClass } from "@/components/ui/form-classes";
import { cn } from "@/lib/cn";
import {
  cancelPurchasePayment,
  markPurchasePaid,
  type PaymentFormState,
} from "./actions";

const initial: PaymentFormState = {};

/**
 * Отметка об оплате закупки: сумма и дата. По умолчанию подставлен весь
 * остаток к оплате - чаще платят одним переводом.
 */
export function PurchasePaymentForm({
  purchaseOrderId,
  remaining,
}: {
  purchaseOrderId: number;
  remaining: number;
}) {
  const [state, action, pending] = useActionState(markPurchasePaid, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        // React 19 после действия очищает поля формы, в том числе при
        // ошибке, и введённое терялось. Отправляем сами - без сброса;
        // после успеха поля чистит эффект ниже. Атрибут action остаётся на
        // случай, если скрипты не загрузились
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />

      <label className="flex flex-col gap-1">
        <span className="text-[0.62rem] tracking-wider text-ink/45">СУММА, ₽</span>
        <input
          name="amount"
          inputMode="decimal"
          // key: после сохранения остаток другой, поле должно показать его
          key={remaining}
          defaultValue={remaining > 0 ? remaining.toFixed(2) : ""}
          className={cn(adminInputClass, "w-32 font-mono")}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[0.62rem] tracking-wider text-ink/45">ДАТА</span>
        <input type="date" name="paidAt" className={cn(adminInputClass, "font-mono")} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
      >
        <Banknote className="size-3.5" aria-hidden />
        {pending ? "Записываю…" : "Отметить оплату"}
      </button>

      {(state.error || state.fieldErrors) && (
        <span role="alert" className="text-xs text-danger">
          {state.error ?? Object.values(state.fieldErrors ?? {})[0]}
        </span>
      )}
      {state.ok && state.message && (
        <span role="status" className="text-xs text-ok">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Отмена оплаты (только администратор): расход уйдёт из бухгалтерии. */
export function CancelPaymentButton({ expenseId }: { expenseId: number }) {
  const [state, action, pending] = useActionState(cancelPurchasePayment, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <ConfirmButton
        title="Отменить оплату?"
        text="Расход закупки пропадёт из бухгалтерии, статус оплаты закупки пересчитается."
        confirmLabel="Отменить оплату"
        disabled={pending}
        ariaLabel="Отменить оплату"
        hint="Отменить оплату"
        className="rounded p-1 text-ink/30 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </ConfirmButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
