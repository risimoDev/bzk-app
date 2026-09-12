"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { createDefect, type QcState } from "@/app/actions/quality";
import { QC_SEVERITY, QC_PHOTO_ACCEPT, type QcSeverity } from "@/lib/quality";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: QcState = { ok: false };

/** Регистрация дефекта с необязательным фотоотчётом. */
export function DefectForm({
  productionOrderId,
  inspectionId,
}: {
  productionOrderId: number;
  inspectionId?: number;
}) {
  const [state, action, pending] = useActionState(createDefect, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-ink/10 bg-bone p-5"
    >
      <input type="hidden" name="productionOrderId" value={productionOrderId} />
      {inspectionId && <input type="hidden" name="inspectionId" value={inspectionId} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЧТО НЕ ТАК</span>
          <input
            name="title"
            required
            maxLength={255}
            placeholder="Например: смещение приводки на 0,4 мм"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ВАЖНОСТЬ</span>
          <select name="severity" defaultValue="major" className={inputClass}>
            {(Object.keys(QC_SEVERITY) as QcSeverity[]).map((key) => (
              <option key={key} value={key}>
                {QC_SEVERITY[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ПОДРОБНОСТИ</span>
          <textarea
            name="description"
            rows={2}
            placeholder="Сколько экземпляров, где именно, что делать дальше"
            className={cn(inputClass, "resize-y")}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>ФОТООТЧЁТ</span>
          <input
            type="file"
            name="photo"
            accept={QC_PHOTO_ACCEPT}
            className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-1 file:font-display file:text-[0.6rem] file:tracking-wider file:text-bone hover:border-ink/30"
          />
          <span className="text-xs text-ink/40">
            JPG, PNG или WebP до 10 МБ - не обязательно, но по снимку спорить не о чем
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-danger px-5 py-2 font-display text-xs tracking-wider text-bone hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "ЗАРЕГИСТРИРОВАТЬ"}
        </button>

        {state.message && (
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
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
