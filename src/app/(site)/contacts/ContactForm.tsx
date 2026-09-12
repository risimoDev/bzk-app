"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, SendHorizonal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { sendContactMessage, type ContactState } from "@/app/actions/contact";
import { PREFERRED_CONTACT, type PreferredContact } from "@/lib/contact";
import { cn } from "@/lib/cn";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: ContactState = {};

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-8"
    >
      <h2 className="font-display text-2xl text-ink">Написать нам</h2>
      <p className="mt-2 text-sm text-ink/55">
        Опишите задачу - тираж, сроки, что нужно получить. Ответим расчётом.
      </p>

      {/*
        Ловушка для роботов. Скрываем от глаз и от программ чтения с экрана,
        но не через display:none - часть ботов такие поля пропускает.
      */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Компания</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          label="ВАШЕ ИМЯ"
          error={state.fieldErrors?.name}
          input={
            <input
              id="name"
              name="name"
              required
              maxLength={255}
              autoComplete="name"
              placeholder="Как к вам обращаться"
              className={inputClass}
            />
          }
        />

        <Field
          id="email"
          label="ПОЧТА"
          error={state.fieldErrors?.email}
          input={
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={255}
              autoComplete="email"
              placeholder="you@example.ru"
              className={inputClass}
            />
          }
        />

        <Field
          id="phone"
          label="ТЕЛЕФОН"
          error={state.fieldErrors?.phone}
          input={
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={50}
              autoComplete="tel"
              placeholder="+7 900 000-00-00"
              className={inputClass}
            />
          }
        />

        <Field
          id="preferredContact"
          label="КАК УДОБНЕЕ ОТВЕТИТЬ"
          input={
            <select
              id="preferredContact"
              name="preferredContact"
              defaultValue="email"
              className={inputClass}
            >
              {(Object.keys(PREFERRED_CONTACT) as PreferredContact[]).map((key) => (
                <option key={key} value={key}>
                  {PREFERRED_CONTACT[key]}
                </option>
              ))}
            </select>
          }
        />

        <div className="sm:col-span-2">
          <Field
            id="message"
            label="ЗАДАЧА"
            error={state.fieldErrors?.message}
            input={
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                maxLength={5000}
                placeholder="Что нужно напечатать или изготовить, какой тираж и к какому сроку"
                className={cn(inputClass, "resize-y")}
              />
            }
          />
        </div>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm text-ink/65">
        <input
          type="checkbox"
          name="agreement"
          required
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
        <span>
          Согласен на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" className="text-brand hover:text-brand-bright">
            политикой конфиденциальности
          </Link>
        </span>
      </label>
      {state.fieldErrors?.agreement && (
        <p className="mt-1.5 text-xs text-danger">{state.fieldErrors.agreement}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-pill bg-brand px-6 py-3 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          <SendHorizonal className="size-4" aria-hidden />
          {pending ? "ОТПРАВЛЯЮ…" : "ОТПРАВИТЬ"}
        </button>

        {state.ok && (
          <p className="flex items-center gap-2 text-sm text-ok" role="status">
            <Check className="size-4" aria-hidden />
            Сообщение отправлено - ответим в рабочее время
          </p>
        )}

        {state.error && (
          <p className="flex items-center gap-2 text-sm text-danger" role="status">
            <TriangleAlert className="size-4" aria-hidden />
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  input,
}: {
  id: string;
  label: string;
  error?: string;
  input: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {input}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const labelClass = siteLabelClass;
const inputClass = siteInputClass;
