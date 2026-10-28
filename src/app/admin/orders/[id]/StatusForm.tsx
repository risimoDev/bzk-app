"use client";

import { useActionState } from "react";
import { changeStatus, type StatusState } from "../actions";
import { ORDER_STATUS, nextStatuses } from "@/lib/order-status";
import { cn } from "@/lib/cn";

const initial: StatusState = {};

/**
 * Смена статуса заказа с сайта.
 *
 * В списке только допустимые переходы из текущего статуса: проверку
 * делает и сервер, но предлагать заведомо запрещённое незачем. Отмена
 * гасит производство и выводит заказ из выручки - об этом подсказка.
 */
export function StatusForm({ orderId, status }: { orderId: number; status: string | null }) {
  const [state, action, pending] = useActionState(changeStatus, initial);
  const options = nextStatuses(status);

  return (
    <form action={action} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="status" className="sr-only">
        Новый статус заказа
      </label>
      <select
        id="status"
        name="status"
        // После сохранения статус другой - пересоздаём поле, иначе React
        // оставит прежний выбор
        key={status ?? "pending"}
        defaultValue={options[0]}
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {ORDER_STATUS[key].label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
      >
        {pending ? "Сохраняю…" : "Сохранить статус"}
      </button>
      <p className="text-xs text-ink/45">
        Отмена снимает заказ с производства и убирает его из выручки.
      </p>
      {(state.message || state.error) && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}
