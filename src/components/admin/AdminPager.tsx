import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Постраничный вывод в списках админки.
 *
 * Раньше половина разделов грузила список целиком, а вторая - молча
 * обрезала его на 50–200 строках: запись за пределом просто пропадала из
 * виду, и понять, что она есть, было нельзя. Теперь у всех один порядок:
 * страница из адреса, счётчик и ссылки «назад/вперёд».
 */

/** Номер страницы из `?page=`: всё, что не положительное целое, - первая. */
export function pageFrom(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Смещение для запроса. */
export function offsetOf(page: number, perPage: number) {
  return (page - 1) * perPage;
}

/**
 * Ссылки на соседние страницы.
 *
 * Остальные параметры адреса сохраняются: фильтр и поиск не должны
 * сбрасываться при листании.
 */
export function AdminPager({
  page,
  perPage,
  total,
  basePath,
  params,
  param = "page",
}: {
  page: number;
  perPage: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  /** Имя параметра в адресе: на странице с двумя списками у каждого своё */
  param?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === param || value === undefined) continue;
      const v = Array.isArray(value) ? value[0] : value;
      if (v !== "") q.set(key, v);
    }
    if (p > 1) q.set(param, String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const from = offsetOf(page, perPage) + 1;
  const to = Math.min(total, page * perPage);
  const linkClass =
    "flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand";

  return (
    <nav
      aria-label="Страницы списка"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="font-mono text-xs text-ink/50">
        {from}–{to} из {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft className="size-4" aria-hidden />
            Назад
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
            <ChevronLeft className="size-4" />
            Назад
          </span>
        )}
        <span className="px-1 font-mono text-xs text-ink/55">
          {Math.min(page, pages)} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Вперёд
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
            Вперёд
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
