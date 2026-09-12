import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Decor, clip, scribble } from "@/components/ui/Collage";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * Корневой not-found живёт вне группы (site), поэтому шапку и подвал
 * подключает сам - иначе страница ошибки осталась бы без навигации,
 * и уйти с неё было бы некуда.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader user={null} cartCount={0} />
      <main className="flex flex-1 flex-col">
        <section className="relative flex flex-1 items-center overflow-hidden py-24 text-bone paper-dark grain sm:py-32">
          <Decor
            asset={scribble.starWhite}
            className="absolute right-[12%] top-10 hidden w-40 -rotate-12 opacity-30 mix-blend-screen sm:block"
          />
          <Decor
            asset={clip.mint}
            className="absolute left-[10%] -top-4 hidden w-14 rotate-[18deg] drop-shadow-lg sm:block"
          />

          <Container className="relative text-center">
            <p className="font-mono text-sm tracking-[0.3em] text-brand-bright">
              404
            </p>
            <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(2.2rem,7vw,4.5rem)] leading-[0.95]">
              Такой страницы нет
            </h1>
            <p className="mx-auto mt-6 max-w-md text-ice/65">
              Возможно, ссылка устарела или в адресе опечатка. Загляните в
              каталог или напишите нам - подскажем, что искали.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <ButtonLink href="/" size="lg">
                На главную
              </ButtonLink>
              <ButtonLink
                href="/catalog"
                size="lg"
                variant="outline"
                className="border-ice/40 text-bone hover:bg-bone hover:text-ink"
              >
                В каталог
              </ButtonLink>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
