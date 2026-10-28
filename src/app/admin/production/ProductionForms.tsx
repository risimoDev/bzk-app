"use client";

import { useActionState } from "react";
import { Check, Factory, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  advanceStage,
  setHold,
  startProduction,
  type ProductionState,
} from "./actions";

const initial: ProductionState = {};

/** Отказ действия - под кнопкой: без этого форма молча «не работала». */
function Failure({ state }: { state: ProductionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs text-danger">
      {state.error}
    </p>
  );
}

/**
 * Запуск заказа в цех. `compact` - маленькая кнопка в очереди на доске,
 * иначе широкая кнопка в карточке заказа менеджера.
 */
export function StartProductionForm({
  field,
  orderId,
  compact,
}: {
  /** Какой это заказ: с сайта или менеджера */
  field: "orderId" | "externalOrderId";
  orderId: number;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(startProduction, initial);

  return (
    <form action={action} className={compact ? undefined : "mt-3"}>
      <input type="hidden" name={field} value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "flex items-center justify-center gap-2 bg-brand text-bone transition-colors hover:bg-brand-bright disabled:opacity-60",
          compact
            ? "gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            : "w-full rounded-lg px-4 py-2 font-display text-xs tracking-wider",
        )}
      >
        {compact ? (
          <Play className="size-3" aria-hidden />
        ) : (
          <Factory className="size-3.5" aria-hidden />
        )}
        {compact ? "В работу" : "ЗАПУСТИТЬ В ПРОИЗВОДСТВО"}
      </button>
      <Failure state={state} />
    </form>
  );
}

/** «Этап готов» и пауза на карточке доски. */
export function StageControls({
  productionOrderId,
  onHold,
}: {
  productionOrderId: number;
  onHold: boolean;
}) {
  const [advanceState, advance, advancing] = useActionState(advanceStage, initial);
  const [holdState, hold, holding] = useActionState(setHold, initial);

  return (
    <div className="mt-3">
      <div className="flex gap-1.5">
        <form action={advance} className="flex-1">
          <input type="hidden" name="productionOrderId" value={productionOrderId} />
          <button
            type="submit"
            disabled={onHold || advancing}
            title={onHold ? "Сначала снимите паузу" : "Закрыть этап и передать дальше"}
            className="flex w-full items-center justify-center gap-1 rounded-md bg-brand px-2 py-1.5 text-[0.68rem] text-bone transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="size-3" aria-hidden />
            Этап готов
          </button>
        </form>

        <form action={hold}>
          <input type="hidden" name="productionOrderId" value={productionOrderId} />
          <input type="hidden" name="hold" value={onHold ? "0" : "1"} />
          <button
            type="submit"
            disabled={holding}
            aria-label={onHold ? "Вернуть в работу" : "Приостановить"}
            title={onHold ? "Вернуть в работу" : "Приостановить"}
            className="rounded-md border border-ink/15 px-2 py-1.5 text-ink/55 transition-colors hover:border-warn hover:text-warn disabled:opacity-50"
          >
            {onHold ? <Play className="size-3" /> : <Pause className="size-3" />}
          </button>
        </form>
      </div>
      <Failure state={advanceState} />
      <Failure state={holdState} />
    </div>
  );
}
