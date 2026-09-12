import { Container } from "@/components/ui/Container";

/**
 * Пока страница витрины грузится.
 *
 * Без этого файла переход по ссылке выглядит так, будто клик не сработал:
 * старая страница стоит, пока новая целиком не соберётся на сервере.
 * Скелет повторяет общий ритм страниц - обложка и плитки, - чтобы при
 * подмене содержимого ничего не прыгало.
 */
export default function SiteLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Загружаем страницу…</span>

      <div className="bg-ink pb-16 pt-24 sm:pt-28">
        <Container>
          <div className="h-3 w-40 animate-pulse rounded-full bg-ice/15" />
          <div className="mt-6 h-12 w-3/4 max-w-xl animate-pulse rounded-xl bg-ice/10" />
        </Container>
      </div>

      <Container className="py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-card border border-ink/10 bg-bone/85">
              <div className="aspect-4/3 animate-pulse bg-ice" />
              <div className="flex flex-col gap-2.5 p-5">
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-ink/10" />
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-ink/10" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
