import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Decor, clip, scribble } from "@/components/ui/Collage";
import { TapeLabel } from "@/components/ui/TapeLabel";

/**
 * Шапка внутренней страницы: тёмная мятая бумага, рваный низ и
 * хлебные крошки. Один компонент на все страницы - иначе ритм
 * заголовков расползётся, и каждая страница будет выглядеть чужой.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  breadcrumb,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <section className="relative overflow-hidden text-bone paper-dark grain">
      <Decor
        asset={scribble.zigzagWhite}
        className="absolute -right-20 -top-10 hidden w-72 opacity-30 mix-blend-screen md:block"
      />
      <Decor
        asset={clip.mint}
        className="absolute right-[7%] -top-3 hidden w-12 rotate-[16deg] drop-shadow-lg lg:block"
      />

      <Container className="relative pb-20 pt-12 sm:pb-24 sm:pt-16">
        {breadcrumb && (
          <nav aria-label="Хлебные крошки" className="mb-8">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ice/50">
              <li>
                <Link href="/" className="hover:text-brand-bright">
                  Главная
                </Link>
              </li>
              {breadcrumb.map((c, i) => (
                <li key={c.href} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 opacity-50" aria-hidden />
                  {i === breadcrumb.length - 1 ? (
                    <span className="text-ice/80" aria-current="page">
                      {c.label}
                    </span>
                  ) : (
                    <Link href={c.href} className="hover:text-brand-bright">
                      {c.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {eyebrow && (
          <div className="mb-3">
            <TapeLabel variant="brand" size="sm" tilt="left">
              {eyebrow}
            </TapeLabel>
          </div>
        )}

        <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.2rem,6vw,4rem)] leading-[0.95] text-bone">
          {title}
        </h1>

        {lead && (
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ice/70">
            {lead}
          </p>
        )}
      </Container>
    </section>
  );
}
