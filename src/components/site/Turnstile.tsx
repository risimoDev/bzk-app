"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Виджет капчи Cloudflare Turnstile.
 *
 * Показывается, только если задан публичный ключ; иначе форма работает
 * без капчи (в разработке ключей обычно нет). Скрипт грузится один раз на
 * страницу, виджет решается сам и кладёт токен в поле
 * `cf-turnstile-response`, которое серверное действие потом проверяет.
 *
 * Тему берём под цвет страницы, язык - русский. При ошибке или устаревшем
 * токене виджет сам перерисовывается, отдельная обработка не нужна.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

// Turnstile вешает свой объект на window; описываем ровно то, чем пользуемся
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Грузит скрипт капчи один раз на всю страницу. */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export function Turnstile() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          language: "ru",
          theme: "light",
          "response-field-name": "cf-turnstile-response",
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  // Нет ключа - формы работают как раньше, без капчи
  if (!SITE_KEY) return null;

  return (
    <div>
      <div ref={ref} id={fieldId} />
      {failed && (
        <p className="mt-1 text-xs text-danger">
          Не удалось загрузить проверку. Обновите страницу.
        </p>
      )}
    </div>
  );
}
