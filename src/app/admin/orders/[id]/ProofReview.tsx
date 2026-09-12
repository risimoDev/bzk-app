"use client";

import { useActionState, useState } from "react";
import { Check, Download, RotateCcw, TriangleAlert, X } from "lucide-react";
import { reviewClientUpload } from "../actions";
import { uploadStatus } from "@/lib/client-portal";
import { cn } from "@/lib/cn";

export type ProofFile = {
  id: number;
  originalName: string;
  description: string | null;
  status: string | null;
  adminComment: string | null;
  fileSize: number;
  createdAt: Date | null;
};

const initial: { ok?: boolean; error?: string } = {};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function sizeText(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Приёмка макетов клиента в карточке заказа.
 *
 * Раньше загруженные клиентом файлы менеджер вообще не видел в заказе -
 * только клиент в своём кабинете. Теперь они здесь, с кнопками вердикта:
 * «в печать», «на доработку» и «отклонить». Для двух последних просим
 * комментарий - по нему клиент поймёт, что переделать.
 */
export function ProofReview({
  files,
  canReview,
}: {
  files: ProofFile[];
  canReview: boolean;
}) {
  if (files.length === 0) {
    return (
      <p className="mt-2.5 text-sm text-ink/50">
        Клиент ещё не приложил макеты к этому заказу.
      </p>
    );
  }

  return (
    <ul className="mt-3 flex flex-col gap-3">
      {files.map((file) => (
        <ProofRow key={file.id} file={file} canReview={canReview} />
      ))}
    </ul>
  );
}

function ProofRow({ file, canReview }: { file: ProofFile; canReview: boolean }) {
  const [state, action, pending] = useActionState(reviewClientUpload, initial);
  // Какой вердикт сейчас оформляем: у «правок» и «отказа» открывается поле
  const [mode, setMode] = useState<"revision" | "rejected" | null>(null);
  const st = uploadStatus(file.status);

  return (
    <li className="rounded-lg border border-ink/10 bg-paper/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={`/api/uploads/${file.id}`}
            className="flex items-center gap-2 text-sm text-ink hover:text-brand"
          >
            <Download className="size-3.5 shrink-0" aria-hidden />
            <span className="break-all">{file.originalName}</span>
          </a>
          <p className="mt-1 flex flex-wrap gap-3 font-mono text-[0.68rem] text-ink/45">
            <span>{sizeText(file.fileSize)}</span>
            {file.createdAt && <span>{dt.format(file.createdAt)}</span>}
          </p>
          {file.description && (
            <p className="mt-1 text-xs text-ink/55">{file.description}</p>
          )}
        </div>

        <span
          className={cn(
            "shrink-0 rounded-pill px-2.5 py-0.5 font-display text-[0.6rem] tracking-[0.12em]",
            st.className,
          )}
        >
          {st.label}
        </span>
      </div>

      {file.adminComment && (
        <p className="mt-2 rounded-lg bg-ink/5 px-3 py-2 text-xs text-ink/70">
          Ваш комментарий: {file.adminComment}
        </p>
      )}

      {canReview && (
        <form action={action} className="mt-3">
          <input type="hidden" name="fileId" value={file.id} />

          {mode ? (
            <div className="flex flex-col gap-2">
              <textarea
                name="comment"
                rows={2}
                required
                autoFocus
                placeholder={
                  mode === "revision"
                    ? "Что поправить: вылет под обрез, цвет, разрешение…"
                    : "Почему макет не подходит"
                }
                className="w-full rounded-lg border border-ink/15 bg-bone px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
              />
              <input type="hidden" name="status" value={mode} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs text-bone transition-colors disabled:opacity-50",
                    mode === "revision" ? "bg-warn hover:opacity-90" : "bg-danger hover:opacity-90",
                  )}
                >
                  {pending
                    ? "Отправляю…"
                    : mode === "revision"
                      ? "Вернуть на доработку"
                      : "Отклонить макет"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-ink/60 hover:text-ink"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                name="status"
                value="approved"
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1.5 text-xs text-bone transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="size-3.5" aria-hidden />
                В печать
              </button>
              <button
                type="button"
                onClick={() => setMode("revision")}
                className="flex items-center gap-1.5 rounded-lg border border-warn/40 px-3 py-1.5 text-xs text-warn hover:bg-warn/10"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                На доработку
              </button>
              <button
                type="button"
                onClick={() => setMode("rejected")}
                className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-ink/55 hover:border-danger/40 hover:text-danger"
              >
                <X className="size-3.5" aria-hidden />
                Отклонить
              </button>
            </div>
          )}

          {state.error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-danger" role="status">
              <TriangleAlert className="size-3.5" aria-hidden />
              {state.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
