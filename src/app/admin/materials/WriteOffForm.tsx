"use client";

import { startTransition, useActionState, useRef, useEffect } from "react";
import { Check, PackageMinus, TriangleAlert, Undo2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { returnWriteOffToStock, writeOffMaterial, type WriteOffState } from "./actions";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: WriteOffState = {};

export type MaterialOption = {
  id: number;
  name: string;
  unit: string;
  quantity: string | null;
};

/**
 * Списание материала на заказ - менеджера или с сайта.
 *
 * Рядом с каждым материалом показан остаток: списывать вслепую то, чего
 * на складе нет, - верный способ увести остаток в минус (сервер этого
 * не даст, но узнать об этом лучше до нажатия).
 */
export function WriteOffForm({
  source,
  orderId,
  materials,
}: {
  source: "site" | "external";
  orderId: number;
  materials: MaterialOption[];
}) {
  const [state, action, pending] = useActionState(writeOffMaterial, initial);
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
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="orderId" value={orderId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>МАТЕРИАЛ</span>
        <select name="materialId" defaultValue="" className={inputClass}>
          <option value="">Выберите материал</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} - {Number(m.quantity ?? 0)} {m.unit}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>СКОЛЬКО СПИСАТЬ</span>
        <input
          name="quantity"
          inputMode="decimal"
          placeholder="12.5"
          className={cn(inputClass, "font-mono")}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand disabled:opacity-60"
      >
        <PackageMinus className="size-3.5" aria-hidden />
        {pending ? "СПИСЫВАЮ…" : "СПИСАТЬ НА ЗАКАЗ"}
      </button>

      {(state.message || state.error) && (
        <span
          className={cn(
            "flex items-start gap-1.5 text-xs",
            state.ok ? "text-ok" : "text-danger",
          )}
          role="status"
        >
          {state.ok ? (
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;

/** «Вернуть на склад» для строки списания. */
export function ReturnWriteOffButton({
  source,
  orderId,
  movementId,
}: {
  source: "site" | "external";
  orderId: number;
  movementId: number;
}) {
  const [state, action, pending] = useActionState(returnWriteOffToStock, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="movementId" value={movementId} />
      <ConfirmButton
        title="Вернуть материал на склад?"
        text="Остаток материала вырастет, а строка расхода по этому списанию пропадёт из бухгалтерии заказа."
        confirmLabel="Вернуть на склад"
        disabled={pending}
        ariaLabel="Вернуть на склад"
        hint="Вернуть на склад"
        className="flex items-center gap-1 rounded p-1 text-xs text-ink/40 hover:bg-brand/10 hover:text-brand disabled:opacity-50"
      >
        <Undo2 className="size-3.5" aria-hidden />
        <span>вернуть</span>
      </ConfirmButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
