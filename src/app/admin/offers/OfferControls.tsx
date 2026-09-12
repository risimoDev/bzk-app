"use client";

import { useActionState } from "react";
import { ArrowRightCircle } from "lucide-react";
import {
  createOrderFromOffer,
  setOfferStatus,
  type OfferState,
} from "@/app/actions/offers";
import { cn } from "@/lib/cn";

const initial: OfferState = {};

const STATUS_LABEL = {
  draft: "Черновик",
  sent: "Отправлено",
  accepted: "Принято",
  rejected: "Отклонено",
  expired: "Истекло",
} as const;

/** Смена состояния КП прямо в списке - открывать карточку незачем. */
export function OfferStatusForm({
  offerId,
  status,
}: {
  offerId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setOfferStatus, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <label htmlFor={`offer-status-${offerId}`} className="sr-only">
        Состояние предложения
      </label>
      <select
        id={`offer-status-${offerId}`}
        name="status"
        defaultValue={status ?? "draft"}
        className="rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      >
        {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((key) => (
          <option key={key} value={key}>
            {STATUS_LABEL[key]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        {pending ? "…" : "ПРИМЕНИТЬ"}
      </button>
      {(state.message || state.error) && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}

/** «Принято → завели заказ»: позиции переезжают сами. */
export function OfferToOrderButton({ offerId }: { offerId: number }) {
  const [state, action, pending] = useActionState(createOrderFromOffer, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 font-display text-[0.6rem] tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
      >
        <ArrowRightCircle className="size-3.5" aria-hidden />
        {pending ? "ЗАВОЖУ…" : "ЗАВЕСТИ ЗАКАЗ"}
      </button>
      {state.error && (
        <span className="text-xs text-danger" role="status">
          {state.error}
        </span>
      )}
    </form>
  );
}
