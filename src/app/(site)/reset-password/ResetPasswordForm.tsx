"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, KeyRound, TriangleAlert } from "lucide-react";
import { resetPassword, type PasswordState } from "@/app/actions/password";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: PasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2.5 text-ink">
          <Check className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          {state.message}
        </p>
        <Link
          href="/login"
          className="self-start rounded-pill bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright"
        >
          ВОЙТИ
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          НОВЫЙ ПАРОЛЬ
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Строчная и заглавная буквы и цифра, от 8 символов"
          className={inputClass}
        />
        {state.fieldErrors?.password && (
          <p className="text-xs text-danger">{state.fieldErrors.password}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="passwordConfirm" className={labelClass}>
          ЕЩЁ РАЗ
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
      >
        <KeyRound className="size-4" aria-hidden />
        {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ ПАРОЛЬ"}
      </button>

      {state.error && (
        <p className="flex items-start gap-2 text-sm text-danger" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
    </form>
  );
}

const labelClass = siteLabelClass;
const inputClass = siteInputClass;
