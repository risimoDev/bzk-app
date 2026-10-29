"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { register, type RegisterState } from "./actions";
import { Turnstile } from "@/components/site/Turnstile";

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    register,
    {},
  );
  const [attempt, setAttempt] = useState(0);
  const err = state.fieldErrors ?? {};

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // React 19 после действия очищает неуправляемые поля формы: после
        // ошибки сервера введённые данные не должны сбрасываться.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setAttempt((n) => n + 1);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-5"
    >
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <Field id="name" label="Имя" error={err.name}>
        {(p) => (
          <input
            {...p}
            name="name"
            autoComplete="name"
            required
            placeholder="Как к вам обращаться"
          />
        )}
      </Field>

      <Field id="email" label="Электронная почта" error={err.email}>
        {(p) => (
          <input
            {...p}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        )}
      </Field>

      <Field
        id="phone"
        label="Телефон"
        error={err.phone}
        hint="Не обязательно - но так менеджеру быстрее с вами связаться"
      >
        {(p) => (
          <input
            {...p}
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+7 900 000-00-00"
          />
        )}
      </Field>

      <Field
        id="password"
        label="Пароль"
        error={err.password}
        hint="Минимум 8 символов: строчная и заглавная буквы и цифра"
      >
        {(p) => (
          <input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
          />
        )}
      </Field>

      <Field id="passwordConfirm" label="Пароль ещё раз" error={err.passwordConfirm}>
        {(p) => (
          <input
            {...p}
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
          />
        )}
      </Field>

      <Turnstile key={attempt} />

      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Создаём…" : "Создать аккаунт"}
      </Button>

      <p className="text-sm text-ink/55">
        Регистрируясь, вы соглашаетесь с{" "}
        <Link href="/terms" className="text-brand hover:text-brand-bright">
          условиями использования
        </Link>{" "}
        и{" "}
        <Link href="/privacy" className="text-brand hover:text-brand-bright">
          политикой конфиденциальности
        </Link>
        .
      </p>

      <p className="text-sm text-ink/55">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-brand hover:text-brand-bright">
          Войти
        </Link>
      </p>
    </form>
  );
}
