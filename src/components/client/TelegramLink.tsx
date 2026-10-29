"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, Send, TriangleAlert } from "lucide-react";
import { issueTelegramLinkCode, type LinkCodeState } from "@/app/actions/telegram";
import { cn } from "@/lib/cn";

const initial: LinkCodeState = {};

/**
 * Код для привязки телеграма.
 *
 * Код выдаётся по кнопке, а не при открытии страницы: он одноразовый и
 * хранится в базе, и каждая загрузка профиля не должна плодить новые.
 * Живёт минуты, поэтому его удобнее скопировать одной кнопкой, чем
 * перепечатывать с экрана на телефон.
 */
export function TelegramLink({
  ttlMinutes,
  botUrl,
  linked,
}: {
  ttlMinutes: number;
  botUrl: string | null;
  linked: boolean;
}) {
  const [state, action, pending] = useActionState(issueTelegramLinkCode, initial);
  const [copied, setCopied] = useState(false);
  const code = state.code;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`/connect ${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен - например, страница открыта без защищённого
      // соединения. Код виден на экране, его можно набрать руками
    }
  }

  if (linked) {
    return (
      <p className="text-sm text-ok">
        Телеграм привязан - уведомления приходят в чат с ботом. Отвязать можно
        командой <code className="font-mono">/disconnect</code> в самом чате.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink/60">
        Нажмите «Получить код» и пришлите его нашему боту командой{" "}
        <code className="font-mono">/connect КОД</code> - уведомления о заказах
        будут приходить в телеграм. Код одноразовый и действует {ttlMinutes} минут.
      </p>

      <form action={action} className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-pill border border-ink/15 px-4 py-2 text-sm text-ink/70 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-60"
        >
          <KeyRound className="size-4" aria-hidden />
          {pending ? "Готовим…" : code ? "Получить новый код" : "Получить код"}
        </button>

        {botUrl && (
          <a
            href={botUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-pill bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright"
          >
            <Send className="size-4" aria-hidden />
            ОТКРЫТЬ БОТА
          </a>
        )}
      </form>

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="status">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {code && (
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg border border-ink/15 bg-paper px-4 py-2 font-mono text-base tracking-widest text-ink">
            {code}
          </code>

          <button
            type="button"
            onClick={copy}
            className={cn(
              "flex items-center gap-1.5 rounded-pill border px-4 py-2 text-sm transition-colors",
              copied
                ? "border-ok/40 text-ok"
                : "border-ink/15 text-ink/60 hover:border-ink/30 hover:text-ink",
            )}
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? "Скопировано" : "Скопировать команду"}
          </button>
        </div>
      )}
    </div>
  );
}
