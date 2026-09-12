"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Код для привязки телеграма.
 *
 * Код короткий и живёт минуты, поэтому его удобнее скопировать одной
 * кнопкой, чем перепечатывать с экрана на телефон.
 */
export function TelegramLink({
  code,
  ttlMinutes,
  botUrl,
  linked,
}: {
  code: string;
  ttlMinutes: number;
  botUrl: string | null;
  linked: boolean;
}) {
  const [copied, setCopied] = useState(false);

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
        Напишите нашему боту <code className="font-mono">/connect {code}</code> - и
        уведомления о заказах будут приходить в телеграм. Код действует{" "}
        {ttlMinutes} минут, после этого обновите страницу и возьмите новый.
      </p>

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
      </div>
    </div>
  );
}
