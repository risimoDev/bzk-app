"use client";

import Link from "next/link";
import { ArrowLeft, Printer, TriangleAlert, Settings2 } from "lucide-react";

/**
 * Панель над печатной формой: вернуться, распечатать, предупредить о
 * незаполненных реквизитах. На бумагу не попадает - скрывается классом
 * no-print.
 *
 * Печать идёт через диалог браузера: он же сохраняет в PDF, и шрифты с
 * кириллицей не приходится встраивать вручную, как это делал Dompdf на
 * старом сайте.
 */
export function PrintBar({
  title,
  backHref,
  warning,
  settingsHref,
}: {
  title: string;
  backHref: string;
  warning?: string;
  settingsHref?: string;
}) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-col gap-3 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink px-4 py-2.5 text-bone">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-bone/70 hover:text-bone"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Назад
          </Link>
          <span className="font-display text-sm tracking-wide">{title}</span>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-md bg-brand px-4 py-1.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
        >
          <Printer className="size-4" aria-hidden />
          ПЕЧАТЬ / PDF
        </button>
      </div>

      {warning && (
        <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{warning}</span>
          {settingsHref && (
            <Link
              href={settingsHref}
              className="flex shrink-0 items-center gap-1.5 underline underline-offset-2"
            >
              <Settings2 className="size-3.5" aria-hidden />
              Заполнить
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
