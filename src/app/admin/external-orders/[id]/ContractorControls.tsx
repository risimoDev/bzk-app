"use client";

import { useActionState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import {
  markContractorTaskSent,
  setContractorStatus,
  type OrderFormState,
} from "@/app/actions/external-orders";
import {
  CONTRACTOR_STATUS,
  nextContractorStatuses,
  type ContractorStatus,
} from "@/lib/contractor-task";
import { adminInlineInputClass } from "@/components/ui/form-classes";

const initial: OrderFormState = {};

/**
 * Статус работы подрядчика на позиции. Меняется сразу при выборе - как
 * производственный статус заказа, отдельной кнопки нет. Форму собираем
 * руками: поле не сбрасывается, а ошибка остаётся рядом со строкой.
 */
export function ContractorStatusSelect({
  orderId,
  itemId,
  status,
}: {
  orderId: number;
  itemId: number;
  status: ContractorStatus;
}) {
  const [state, action] = useActionState(setContractorStatus, initial);
  const [pending, startTransition] = useTransition();

  const change = (to: string) => {
    const fd = new FormData();
    fd.set("orderId", String(orderId));
    fd.set("itemId", String(itemId));
    fd.set("contractorStatus", to);
    startTransition(() => action(fd));
  };

  return (
    <span className="flex flex-col items-end gap-1">
      {/* Список пересоздаётся при смене статуса: иначе после перезагрузки
          данных он показывал бы прежнее значение */}
      <select
        key={status}
        defaultValue={status}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        aria-label="Статус работы подрядчика"
        className={adminInlineInputClass}
      >
        <option value={status}>{CONTRACTOR_STATUS[status].label}</option>
        {nextContractorStatuses(status).map((s) => (
          <option key={s} value={s}>
            {CONTRACTOR_STATUS[s].label}
          </option>
        ))}
      </select>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </span>
  );
}

/** «Задание отправлено»: все неотправленные позиции подрядчика разом. */
export function MarkSentButton({
  orderId,
  supplierId,
}: {
  orderId: number;
  supplierId: number;
}) {
  const [state, action, pending] = useActionState(markContractorTaskSent, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand disabled:opacity-60"
      >
        <Send className="size-3" aria-hidden />
        {pending ? "ОТМЕЧАЮ…" : "ОТМЕТИТЬ ОТПРАВЛЕННЫМ"}
      </button>
      {(state.message || state.error) && (
        <span
          className={state.ok ? "flex items-center gap-1 text-xs text-ok" : "text-xs text-danger"}
          role="status"
        >
          {state.ok && <Check className="size-3.5" aria-hidden />}
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}
