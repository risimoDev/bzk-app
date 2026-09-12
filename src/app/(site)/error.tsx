"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { site } from "@/lib/site";

/**
 * Ошибка на странице витрины.
 *
 * Шапка и подвал остаются - они в макете выше, - поэтому человек не
 * застревает на пустом экране: может повторить, уйти в каталог или
 * позвонить. Текст ошибки не показываем: в бою он и так скрыт, а код
 * пригодится, если клиент перешлёт снимок экрана.
 */
export default function SiteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="relative flex flex-1 items-center overflow-hidden py-24 text-bone paper-dark grain sm:py-32">
      <Container className="relative text-center">
        <p className="font-mono text-sm tracking-[0.3em] text-brand-bright">ОШИБКА</p>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(2.2rem,7vw,4.2rem)] leading-[0.95]">
          Страница не загрузилась
        </h1>
        <p className="mx-auto mt-6 max-w-md text-ice/65">
          Что-то сломалось на нашей стороне. Попробуйте ещё раз - чаще всего это
          помогает. Если нет, позвоните{" "}
          <a href={site.phoneHref} className="whitespace-nowrap text-brand-bright hover:underline">
            {site.phone}
          </a>
          .
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button type="button" size="lg" onClick={() => retry()}>
            <RotateCw className="size-5" aria-hidden />
            Попробовать ещё раз
          </Button>
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-pill border border-ice/40 px-6 py-3 font-display text-sm tracking-wider text-bone transition-colors hover:bg-bone hover:text-ink"
          >
            В каталог
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 font-mono text-xs text-ice/35">Код ошибки: {error.digest}</p>
        )}
      </Container>
    </section>
  );
}
