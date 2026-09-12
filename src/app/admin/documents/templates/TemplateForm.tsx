"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { saveTemplate, type TemplateState } from "@/app/actions/document-templates";
import { cn } from "@/lib/cn";

export type TemplateValue = {
  id: number;
  name: string;
  description: string | null;
  categoryId: number | null;
  numberPrefix: string | null;
  isNumbered: boolean | null;
  isActive: boolean | null;
  contentTemplate: string | null;
  fieldsSchema: unknown;
};

const FIELDS_EXAMPLE = `{
  "fields": [
    { "name": "client_name", "label": "Клиент", "type": "text", "required": true },
    { "name": "amount", "label": "Сумма", "type": "number" }
  ]
}`;

/**
 * Редактор шаблона документа.
 *
 * Разметка и схема полей правятся как текст: визуальный редактор для
 * HTML со старых шаблонов ломал бы таблицы, на которых держится печать.
 * Схема проверяется при сохранении, а превью под формой показывает
 * шаблон ровно так, как его увидит документ, - после белого списка тегов.
 */
export function TemplateForm({
  template,
  categories,
  readOnly,
}: {
  template?: TemplateValue;
  categories: { id: number; name: string }[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<TemplateState, FormData>(saveTemplate, {});
  const err = state.fieldErrors ?? {};

  const fieldsText =
    template?.fieldsSchema !== null && template?.fieldsSchema !== undefined
      ? JSON.stringify(template.fieldsSchema, null, 2)
      : "";

  return (
    <form action={action} className="flex flex-col gap-5">
      {template && <input type="hidden" name="id" value={template.id} />}

      {state.error && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-ok/10 px-4 py-3 text-sm text-ok">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}
      {Object.keys(err).length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Проверьте поля, отмеченные красным.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Название" error={err.name}>
          <input
            id="name"
            name="name"
            defaultValue={template?.name ?? ""}
            maxLength={150}
            required
            disabled={readOnly}
            className={input(err.name)}
          />
        </Field>

        <Field id="categoryId" label="Раздел" error={err.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={template?.categoryId ? String(template.categoryId) : ""}
            disabled={readOnly}
            className={input(err.categoryId)}
          >
            <option value="">Без раздела</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="description" label="Описание" error={err.description} wide>
          <input
            id="description"
            name="description"
            defaultValue={template?.description ?? ""}
            maxLength={1000}
            disabled={readOnly}
            placeholder="Для чего шаблон - видно в списке"
            className={input(err.description)}
          />
        </Field>

        <Field
          id="numberPrefix"
          label="Префикс номера"
          error={err.numberPrefix}
          hint="Номер собирается как префикс, год и порядковый: АКТ-2026-001"
        >
          <input
            id="numberPrefix"
            name="numberPrefix"
            defaultValue={template?.numberPrefix ?? ""}
            maxLength={20}
            disabled={readOnly}
            className={cn(input(err.numberPrefix), "font-mono")}
          />
        </Field>

        <div className="flex flex-col justify-center gap-2.5 rounded-xl border border-ink/10 bg-paper px-4 py-3">
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="isNumbered"
              defaultChecked={template?.isNumbered ?? true}
              disabled={readOnly}
              className="size-4 accent-brand"
            />
            Нумеровать автоматически
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={template?.isActive ?? true}
              disabled={readOnly}
              className="size-4 accent-brand"
            />
            Доступен при создании документа
          </label>
        </div>
      </div>

      <Field
        id="contentTemplate"
        label="Разметка (HTML)"
        error={err.contentTemplate}
        hint="Разметка копируется в новый документ как есть, вместе с {{плейсхолдерами}} - их заполняют в самом документе. Скрипты, ссылки и картинки при показе вырезаются."
      >
        <textarea
          id="contentTemplate"
          name="contentTemplate"
          defaultValue={template?.contentTemplate ?? ""}
          rows={18}
          spellCheck={false}
          disabled={readOnly}
          className={cn(input(err.contentTemplate), "resize-y font-mono text-xs leading-relaxed")}
        />
      </Field>

      <Field
        id="fieldsSchema"
        label="Схема полей (JSON)"
        error={err.fieldsSchema}
        hint="Описание полей шаблона - видно в списке шаблонов. Имя поля - латиницей. Можно оставить пустым."
      >
        <textarea
          id="fieldsSchema"
          name="fieldsSchema"
          defaultValue={fieldsText}
          rows={10}
          spellCheck={false}
          disabled={readOnly}
          placeholder={FIELDS_EXAMPLE}
          className={cn(input(err.fieldsSchema), "resize-y font-mono text-xs leading-relaxed")}
        />
      </Field>

      {!readOnly && (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : template ? "Сохранить шаблон" : "Завести шаблон"}
          </button>
        </div>
      )}
    </form>
  );
}

const input = (error?: string) =>
  cn(
    "w-full rounded-lg border bg-bone px-3 py-2 text-sm text-ink placeholder:text-ink/30",
    "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink/50",
    error ? "border-danger" : "border-ink/15 hover:border-ink/30",
  );

function Field({
  id,
  label,
  error,
  hint,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink/45">{hint}</p>
      ) : null}
    </div>
  );
}
