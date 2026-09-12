"use client";

import { useActionState } from "react";
import { setDocumentStatus, type DocumentState } from "@/app/actions/documents";
import { DOC_STATUS } from "@/lib/documents-meta";
import { cn } from "@/lib/cn";

const initial: DocumentState = {};

/** Смена состояния документа. Каждая пишется в его историю. */
export function DocumentStatusForm({
  documentId,
  status,
}: {
  documentId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setDocumentStatus, initial);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <label htmlFor={`doc-status-${documentId}`} className="sr-only">
        Состояние документа
      </label>
      <select
        id={`doc-status-${documentId}`}
        name="status"
        defaultValue={status ?? "draft"}
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      >
        {(Object.keys(DOC_STATUS) as (keyof typeof DOC_STATUS)[]).map((key) => (
          <option key={key} value={key}>
            {DOC_STATUS[key].label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        {pending ? "СОХРАНЯЮ…" : "ПРИМЕНИТЬ"}
      </button>
      {(state.message || state.error) && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}
