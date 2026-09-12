"use client";

import { useActionState } from "react";
import { Link2, Link2Off, Send, Unlink } from "lucide-react";
import {
  registerWebhook,
  removeWebhook,
  sendTestMessage,
  unlinkTelegram,
  type TelegramState,
} from "@/app/actions/telegram";
import { cn } from "@/lib/cn";

const initial: TelegramState = { ok: false };

function Status({ state }: { state: TelegramState }) {
  if (!state.message) return null;
  return (
    <span
      className={cn("text-sm", state.ok ? "text-ok" : "text-danger")}
      role="status"
    >
      {state.message}
    </span>
  );
}

export function WebhookControls({ registered }: { registered: boolean }) {
  const [setState, setAction, setting] = useActionState(registerWebhook, initial);
  const [delState, delAction, deleting] = useActionState(removeWebhook, initial);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={setAction}>
          <button
            type="submit"
            disabled={setting}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
          >
            <Link2 className="size-3.5" aria-hidden />
            {setting ? "РЕГИСТРИРУЮ…" : registered ? "ПЕРЕРЕГИСТРИРОВАТЬ" : "ЗАРЕГИСТРИРОВАТЬ"}
          </button>
        </form>

        {registered && (
          <form action={delAction}>
            <button
              type="submit"
              disabled={deleting}
              className="flex items-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-danger/40 hover:text-danger disabled:opacity-60"
            >
              <Link2Off className="size-3.5" aria-hidden />
              {deleting ? "СНИМАЮ…" : "СНЯТЬ"}
            </button>
          </form>
        )}
      </div>

      <Status state={setState.message ? setState : delState} />
    </div>
  );
}

export function TestMessageButton() {
  const [state, action, pending] = useActionState(sendTestMessage, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        <Send className="size-3.5" aria-hidden />
        {pending ? "ОТПРАВЛЯЮ…" : "ПРОБНОЕ СООБЩЕНИЕ"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function UnlinkButton({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(unlinkTelegram, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/35 hover:text-danger disabled:opacity-50"
      >
        <Unlink className="size-3.5" aria-hidden />
        {pending ? "Отвязываю…" : "Отвязать"}
      </button>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
