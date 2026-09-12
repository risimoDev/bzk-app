/**
 * Пока раздел админки грузится.
 *
 * Меню остаётся на месте, а вместо содержимого - заголовок и строки
 * таблицы: так видно, что клик принят и раздел уже открывается.
 */
export default function AdminLoading() {
  return (
    <div className="px-5 pb-16 pt-20 sm:px-8 lg:pt-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загружаем раздел…</span>
      <div className="border-b border-ink/10 pb-5">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-2.5 h-3 w-72 max-w-full animate-pulse rounded-full bg-ink/8" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-ink/10 bg-bone" />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-ink/10 bg-bone">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-ink/6 px-4 py-3.5 last:border-0">
            <div className="h-3 w-12 animate-pulse rounded-full bg-ink/10" />
            <div className="h-3 flex-1 animate-pulse rounded-full bg-ink/8" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
