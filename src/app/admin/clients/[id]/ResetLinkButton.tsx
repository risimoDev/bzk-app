"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { sendResetLink, type ClientActionState } from "../actions";
import { cn } from "@/lib/cn";

const initial: ClientActionState = { ok: false };

/**
 * Отправка клиенту ссылки на смену пароля.
 *
 * Пароль менеджер не задаёт: он запускает ту же процедуру, что и кнопка
 * «забыли пароль» на сайте. Так пароль не приходится диктовать по
 * телефону и он не остаётся в переписке.
 */
export function ResetLinkButton({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(sendResetLink, initial);

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
      >
        <KeyRound className="size-4" aria-hidden />
        {pending ? "Отправляю…" : "Прислать ссылку на смену пароля"}
      </button>
      {state.message && (
        <span
          className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
