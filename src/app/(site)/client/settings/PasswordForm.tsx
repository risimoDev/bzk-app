"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, KeyRound, TriangleAlert } from "lucide-react";
import { changePassword, type PasswordState } from "@/app/actions/password";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: PasswordState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currentPassword" className={labelClass}>
            ТЕКУЩИЙ
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
          {state.fieldErrors?.currentPassword && (
            <p className="text-xs text-danger">{state.fieldErrors.currentPassword}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPassword" className={labelClass}>
            НОВЫЙ
          </label>
          <input
            id="newPassword"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          {state.fieldErrors?.password ? (
            <p className="text-xs text-danger">{state.fieldErrors.password}</p>
          ) : (
            <p className="text-xs text-ink/45">
              Минимум 8 символов: строчная и заглавная буквы и цифра.
            </p>
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
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-pill bg-brand px-6 py-3 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          <KeyRound className="size-4" aria-hidden />
          {pending ? "МЕНЯЮ…" : "СМЕНИТЬ ПАРОЛЬ"}
        </button>

        {state.ok && (
          <p className="flex items-center gap-2 text-sm text-ok" role="status">
            <Check className="size-4" aria-hidden />
            {state.message}
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

const labelClass = siteLabelClass;
const inputClass = siteInputClass;
