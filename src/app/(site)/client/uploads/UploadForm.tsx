"use client";

import { useActionState, useEffect, useRef } from "react";
import { CloudUpload, Check, TriangleAlert } from "lucide-react";
import { uploadClientFile, type ActionState } from "@/app/actions/client";
import { ACCEPT_ATTRIBUTE, ALLOWED_EXTENSIONS } from "@/lib/client-portal";
import { cn } from "@/lib/cn";
import { siteLabelClass } from "@/components/ui/form-classes";

const initial: ActionState = { ok: false };

export type OrderOption = { id: number; label: string };

/** Загрузка макета. Заказ можно не выбирать - файл просто ляжет в общие. */
export function UploadForm({
  orders,
  defaultOrderId,
}: {
  orders: OrderOption[];
  defaultOrderId?: number;
}) {
  const [state, action, pending] = useActionState(uploadClientFile, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7"
    >
      <h2 className="flex items-center gap-2.5 font-display text-xl text-ink">
        <CloudUpload className="size-5 text-brand" aria-hidden />
        Загрузить файл
      </h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="file" className={labelClass}>
            ФАЙЛ
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={ACCEPT_ATTRIBUTE}
            className="w-full rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink file:mr-4 file:rounded-pill file:border-0 file:bg-ink file:px-4 file:py-1.5 file:font-display file:text-xs file:tracking-wider file:text-bone hover:border-ink/30"
          />
          <p className="text-xs text-ink/45">
            До 50 МБ. Принимаем {ALLOWED_EXTENSIONS.join(", ")}. Если файлов много -
            присылайте архивом.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="orderId" className={labelClass}>
            К ЗАКАЗУ
          </label>
          <select
            id="orderId"
            name="orderId"
            defaultValue={defaultOrderId ? String(defaultOrderId) : ""}
            className="w-full rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          >
            <option value="">Без привязки</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className={labelClass}>
            ЧТО ЭТО ЗА ФАЙЛ
          </label>
          <input
            id="description"
            name="description"
            maxLength={500}
            placeholder="Например: логотип в кривых"
            className="w-full rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ЗАГРУЖАЮ…" : "ЗАГРУЗИТЬ"}
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

const labelClass = siteLabelClass;
