"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, ShieldAlert, TriangleAlert } from "lucide-react";
import { createInspection, type QcState } from "@/app/actions/quality";
import {
  QC_ITEM_STATUS,
  qcResult,
  overallResult,
  type QcItemStatus,
} from "@/lib/quality";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: QcState = { ok: false };

export type ChecklistOption = {
  id: number;
  name: string;
  stageId: number | null;
  items: { id: number; text: string; description: string; critical: boolean }[];
};

/**
 * Проведение проверки.
 *
 * Итог не выбирается руками, а выводится из отметок: провал критического
 * пункта - брак, провал обычного - замечания. Показываем его сразу, до
 * отправки, чтобы решение не оказалось для проверяющего неожиданностью.
 */
export function InspectionForm({
  productionOrderId,
  checklists,
  stages,
  defaultChecklistId,
  defaultStageId,
}: {
  productionOrderId: number;
  checklists: ChecklistOption[];
  stages: { id: number; name: string }[];
  defaultChecklistId: number;
  defaultStageId: number | null;
}) {
  const [state, action, pending] = useActionState(createInspection, initial);
  const [checklistId, setChecklistId] = useState(defaultChecklistId);
  const [marks, setMarks] = useState<Record<number, QcItemStatus>>({});

  const checklist = checklists.find((c) => c.id === checklistId) ?? checklists[0];

  const preview = useMemo(() => {
    if (!checklist) return null;
    return overallResult(
      checklist.items.map((i) => ({
        status: marks[i.id] ?? "ok",
        critical: i.critical,
      })),
    );
  }, [checklist, marks]);

  if (!checklist) {
    return (
      <p className="rounded-xl bg-warn/10 px-5 py-4 text-sm text-warn">
        Ни одного чек-листа с пунктами не заведено - проверять не по чему.
      </p>
    );
  }

  const previewStyle = preview ? qcResult(preview) : null;

  return (
    <form action={action} className="flex max-w-4xl flex-col gap-5">
      <input type="hidden" name="productionOrderId" value={productionOrderId} />

      <div className="grid gap-4 rounded-xl border border-ink/10 bg-bone p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЧЕК-ЛИСТ</span>
          <select
            name="checklistId"
            value={checklistId}
            onChange={(e) => {
              setChecklistId(Number(e.target.value));
              // Отметки относятся к пунктам прежнего списка - при смене
              // чек-листа их нельзя переносить на другие пункты
              setMarks({});
            }}
            className={inputClass}
          >
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - пунктов {c.items.length}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЭТАП ЗАКАЗА</span>
          <select
            name="stageId"
            defaultValue={defaultStageId ? String(defaultStageId) : ""}
            className={inputClass}
          >
            <option value="">Не указывать</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {stages.length === 0 && (
            <span className="text-xs text-ink/40">
              У этого заказа этапы ещё не заведены - проверку можно провести и так
            </span>
          )}
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
        <header className="border-b border-ink/10 px-5 py-3">
          <h2 className="font-display text-sm text-ink">Пункты проверки</h2>
        </header>

        <ul className="divide-y divide-ink/6">
          {checklist.items.map((item) => {
            const current = marks[item.id] ?? "ok";
            return (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-56 flex-1">
                    <span className="flex items-start gap-2 text-sm text-ink">
                      {item.critical && (
                        <ShieldAlert
                          className="mt-0.5 size-3.5 shrink-0 text-danger"
                          aria-label="Критический пункт"
                        />
                      )}
                      {item.text}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 block text-xs text-ink/50">
                        {item.description}
                      </span>
                    )}
                  </div>

                  <fieldset className="flex gap-1.5">
                    <legend className="sr-only">Оценка пункта: {item.text}</legend>
                    {(Object.keys(QC_ITEM_STATUS) as QcItemStatus[]).map((key) => (
                      <label
                        key={key}
                        className={cn(
                          "cursor-pointer rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
                          current === key
                            ? QC_ITEM_STATUS[key].className
                            : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
                        )}
                      >
                        <input
                          type="radio"
                          name={`status-${item.id}`}
                          value={key}
                          checked={current === key}
                          onChange={() =>
                            setMarks((m) => ({ ...m, [item.id]: key }))
                          }
                          className="sr-only"
                        />
                        {QC_ITEM_STATUS[key].label}
                      </label>
                    ))}
                  </fieldset>
                </div>

                {current === "fail" && (
                  <input
                    name={`comment-${item.id}`}
                    maxLength={500}
                    placeholder="Что именно не так - попадёт в протокол"
                    className={cn(inputClass, "mt-3")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ЗАКЛЮЧЕНИЕ</span>
        <textarea
          name="summary"
          rows={3}
          placeholder="Общий вывод по партии - не обязательно"
          className={cn(inputClass, "resize-y")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ ПРОВЕРКУ"}
        </button>

        {previewStyle && (
          <span className="flex items-center gap-2 text-sm text-ink/55">
            Итог:
            <span
              className={cn(
                "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                previewStyle.className,
              )}
            >
              {previewStyle.label}
            </span>
          </span>
        )}

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
