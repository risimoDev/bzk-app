"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  updateDefectStatus,
  deleteDefect,
  type QcState,
} from "@/app/actions/quality";
import { QC_DEFECT_STATUS, type QcDefectStatus } from "@/lib/quality";
import { cn } from "@/lib/cn";

const initial: QcState = { ok: false };

/**
 * Смена статуса дефекта. Кнопки, а не выпадающий список: статусов
 * четыре, и одно нажатие короче двух.
 */
export function DefectStatusControls({
  defectId,
  status,
}: {
  defectId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(updateDefectStatus, initial);
  const current = status ?? "open";

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="defectId" value={defectId} />

      {(Object.keys(QC_DEFECT_STATUS) as QcDefectStatus[]).map((key) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="submit"
            name="status"
            value={key}
            disabled={pending || active}
            className={cn(
              "rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              active
                ? QC_DEFECT_STATUS[key].className
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
              pending && "opacity-60",
            )}
          >
            {QC_DEFECT_STATUS[key].label}
          </button>
        );
      })}

      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Удаление дефекта вместе с фотоотчётом. */
export function DeleteDefectButton({ defectId }: { defectId: number }) {
  const [state, action, pending] = useActionState(deleteDefect, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="defectId" value={defectId} />
      <ConfirmButton
        title="Удалить дефект?"
        text="Запись удалится вместе с фотоотчётом."
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/35 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
        {pending ? "Удаляю…" : "Удалить"}
      </ConfirmButton>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
