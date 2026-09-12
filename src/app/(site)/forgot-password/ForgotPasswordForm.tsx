"use client";

import { useActionState } from "react";
import { Check, SendHorizonal, TriangleAlert } from "lucide-react";
import { requestPasswordReset, type PasswordState } from "@/app/actions/password";
import { siteInputClass, siteLabelClass } from "@/components/ui/form-classes";

const initial: PasswordState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2.5 text-ink">
          <Check className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          {state.message}
        </p>
        <p className="text-sm text-ink/55">
          Ссылка действует два часа. Если она не пришла - позвоните нам, поможем руками.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          ПОЧТА
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={255}
          placeholder="Адрес, на который заведён аккаунт"
          className={inputClass}
        />
        {state.fieldErrors?.email && (
          <p className="text-xs text-danger">{state.fieldErrors.email}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
      >
        <SendHorizonal className="size-4" aria-hidden />
        {pending ? "ОТПРАВЛЯЮ…" : "ПРИСЛАТЬ ССЫЛКУ"}
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
