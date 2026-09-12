"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { login, type LoginState } from "./actions";
import { Turnstile } from "@/components/site/Turnstile";

export function LoginForm() {
  const params = useSearchParams();
  const redirectTo = params.get("from") ?? "/client/dashboard";

  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  // После смены пароля в кабинете сессии сбрасываются, и человек попадает
  // сюда. Скажем прямо, почему пришлось войти заново.
  const passwordChanged = params.get("reason") === "password-changed";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {passwordChanged && !state.error && (
        <p
          role="status"
          className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok"
        >
          Пароль изменён. Войдите с новым паролем - на других устройствах вход
          тоже потребуется заново.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <Field id="email" label="Электронная почта">
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

      <Field id="password" label="Пароль">
        {(p) => (
          <input
            {...p}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        )}
      </Field>

      {/* Поле кода появляется, только когда сервер сказал, что он нужен:
          спрашивать его у всех значило бы пугать клиентов витрины */}
      {state.needsTotp && (
        <Field id="totp" label="Код из приложения">
          {(p) => (
            <input
              {...p}
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="123456"
            />
          )}
        </Field>
      )}

      <Turnstile />

      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? "Проверяем…" : "Войти"}
      </Button>

      <p className="text-sm text-ink/55">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-brand hover:text-brand-bright">
          Зарегистрироваться
        </Link>
      </p>

      <p className="text-sm text-ink/55">
        <Link href="/forgot-password" className="text-brand hover:text-brand-bright">
          Забыли пароль?
        </Link>
      </p>
    </form>
  );
}
