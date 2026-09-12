"use client";

import { useActionState, useState } from "react";
import { Check, TriangleAlert, Eraser } from "lucide-react";
import { saveSeo, clearSeo, type SeoState } from "@/app/actions/seo";
import { SEO_LIMITS } from "@/lib/seo";
import { cn } from "@/lib/cn";
import { adminInputClass } from "@/components/ui/form-classes";

const initial: SeoState = { ok: false };

export type SeoValues = {
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
};

/**
 * Настройки одной страницы.
 *
 * Длину заголовка и описания показываем на месте: поисковики обрезают
 * выдачу примерно на шестидесяти и ста шестидесяти символах, и проще
 * увидеть перебор сразу, чем потом в поиске.
 */
export function SeoForm({
  page,
  label,
  values,
  saved,
  fallbackTitle,
  fallbackDescription,
}: {
  page: string;
  label: string;
  values: SeoValues;
  saved: boolean;
  fallbackTitle: string;
  fallbackDescription: string;
}) {
  const [state, action, pending] = useActionState(saveSeo, initial);
  const [clearState, clearAction, clearing] = useActionState(clearSeo, initial);

  const [title, setTitle] = useState(values.title);
  const [description, setDescription] = useState(values.description);

  return (
    <section className="rounded-xl border border-ink/10 bg-bone">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/10 px-5 py-3">
        <h2 className="font-display text-base text-ink">
          {label}
          <span className="ml-2 font-mono text-xs text-ink/40">{page}</span>
        </h2>
        <span className="text-xs text-ink/45">
          {saved ? "настроено" : "по умолчанию из кода страницы"}
        </span>
      </header>

      <form action={action} className="px-5 py-4">
        <input type="hidden" name="page" value={page} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Заголовок"
            counter={`${title.length} / ${SEO_LIMITS.title}`}
            over={title.length > SEO_LIMITS.title}
            hint={saved ? undefined : `сейчас: ${fallbackTitle}`}
            wide
          >
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              placeholder={fallbackTitle}
              className={inputClass}
            />
          </Field>

          <Field
            label="Описание"
            counter={`${description.length} / ${SEO_LIMITS.description}`}
            over={description.length > SEO_LIMITS.description}
            hint={saved ? undefined : "сейчас берётся общее описание сайта"}
            wide
          >
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={fallbackDescription}
              className={cn(inputClass, "resize-y")}
            />
          </Field>

          <Field label="Ключевые слова" hint="через запятую; на выдачу давно не влияют" wide>
            <input name="keywords" defaultValue={values.keywords} className={inputClass} />
          </Field>

          <Field label="Заголовок для соцсетей" hint="пусто - возьмётся обычный">
            <input name="ogTitle" defaultValue={values.ogTitle} maxLength={255} className={inputClass} />
          </Field>

          <Field label="Картинка для соцсетей" hint="/collage/… или полная ссылка">
            <input name="ogImage" defaultValue={values.ogImage} maxLength={255} className={inputClass} />
          </Field>

          <Field label="Описание для соцсетей" wide>
            <textarea
              name="ogDescription"
              defaultValue={values.ogDescription}
              rows={2}
              className={cn(inputClass, "resize-y")}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
          >
            {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
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

      {saved && (
        <form action={clearAction} className="flex flex-wrap items-center gap-3 border-t border-ink/8 px-5 py-3">
          <input type="hidden" name="page" value={page} />
          <button
            type="submit"
            disabled={clearing}
            className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-danger disabled:opacity-50"
          >
            <Eraser className="size-3.5" aria-hidden />
            {clearing ? "Убираю…" : "Убрать настройки"}
          </button>
          {clearState.message && (
            <span
              className={cn("text-xs", clearState.ok ? "text-ok" : "text-danger")}
              role="status"
            >
              {clearState.message}
            </span>
          )}
        </form>
      )}
    </section>
  );
}

function Field({
  label,
  counter,
  over,
  hint,
  wide,
  children,
}: {
  label: string;
  counter?: string;
  over?: boolean;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
          {label.toUpperCase()}
        </span>
        {counter && (
          <span
            className={cn(
              "font-mono text-[0.65rem] tabular-nums",
              over ? "text-warn" : "text-ink/35",
            )}
          >
            {counter}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs text-ink/40">{hint}</span>}
    </label>
  );
}

const inputClass = adminInputClass;
