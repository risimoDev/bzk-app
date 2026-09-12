"use client";

const KEY = "bzk_favorites";
const EVENT = "bzk:favorites";

/**
 * Избранное живёт в браузере - так же, как на старом сайте, где сервер
 * получал только список id. Значит, оно работает и без регистрации,
 * но не переезжает на другое устройство.
 *
 * Наружу отдаётся как внешнее хранилище для useSyncExternalStore: это
 * штатный способ подписаться на источник за пределами React. Чтение
 * состояния в useEffect с последующим setState давало бы лишний рендер
 * и рассинхрон с разметкой, пришедшей с сервера.
 */

let snapshot: number[] = [];
let raw: string | null = null;

function parse(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((n) => Number.isInteger(n) && n > 0).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function currentRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Приватный режим или запрет на хранилище
    return null;
  }
}

/**
 * Снимок должен быть стабильным по ссылке, пока строка в хранилище не
 * изменилась: иначе useSyncExternalStore уходит в бесконечный рендер.
 */
export function getFavoritesSnapshot(): number[] {
  const next = currentRaw();
  if (next !== raw) {
    raw = next;
    snapshot = parse(next);
  }
  return snapshot;
}

/** На сервере избранного нет - отдаём тот же пустой массив. */
const EMPTY: number[] = [];
export const getFavoritesServerSnapshot = () => EMPTY;

export function subscribeFavorites(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Изменения из соседней вкладки
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function writeFavorites(ids: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 100)));
  } catch {
    // Записать не вышло - молчим: падать из-за избранного нельзя
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleFavorite(id: number) {
  const ids = getFavoritesSnapshot();
  writeFavorites(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}
