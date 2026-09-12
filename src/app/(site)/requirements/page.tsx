import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { FileType2, Ruler, Palette, ScissorsLineDashed, TriangleAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { Decor, scrap } from "@/components/ui/Collage";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Требования к макетам",
  description:
    "Форматы файлов, разрешение, вылеты, цветовая модель и шрифты - что нужно проверить в макете до отправки в печать.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/requirements"), "/requirements");
}

const RULES = [
  {
    icon: FileType2,
    title: "Форматы файлов",
    items: [
      "PDF - предпочтительный формат, все элементы сохраняются как есть",
      "AI, EPS - векторные исходники, шрифты в кривых",
      "PSD, TIFF - растровые, слои сведены",
      "JPG - только для простых макетов, без прозрачности",
    ],
  },
  {
    icon: Ruler,
    title: "Разрешение",
    items: [
      "300 dpi для офсетной и цифровой печати в натуральную величину",
      "150 dpi достаточно для широкоформатной печати",
      "Векторные элементы разрешения не имеют - их можно масштабировать свободно",
      "Увеличивать растровое изображение программно бесполезно: деталей не прибавится",
    ],
  },
  {
    icon: Palette,
    title: "Цвет",
    items: [
      "Цветовая модель - CMYK. Макеты в RGB конвертируются, и цвет может уйти",
      "Плашечные цвета Pantone указывайте отдельно",
      "Чёрный текст - только 100% Black, без составного чёрного",
      "Суммарная плотность краски не более 300%",
    ],
  },
  {
    icon: ScissorsLineDashed,
    title: "Вылеты и поля",
    items: [
      "Вылеты - 2 мм с каждой стороны от обрезного формата",
      "Значимые элементы не ближе 5 мм к линии реза",
      "Метки реза добавлять не нужно, мы расставим их сами",
      "Для многостраничных изделий учитывайте поле под переплёт",
    ],
  },
];

const CHECKLIST = [
  "Шрифты переведены в кривые или приложены отдельным файлом",
  "Прозрачности и эффекты сведены",
  "Все связанные изображения внедрены в файл",
  "Макет в натуральную величину, без масштабирования",
  "Проверена орфография - мы печатаем ровно то, что согласовано",
];

export default function RequirementsPage() {
  return (
    <>
      <PageHero
        eyebrow="Допечатная подготовка"
        title="Требования к макетам"
        lead="Макет, собранный по этим правилам, уходит в печать без правок и задержек. Если что-то не сходится - пришлите как есть, посмотрим и подскажем."
        breadcrumb={[{ href: "/requirements", label: "Требования" }]}
      />

      <section className="relative overflow-hidden torn-5 pb-16 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Decor
          asset={scrap.graphStrip}
          className="absolute -right-24 top-12 hidden w-72 rotate-6 opacity-70 lg:block"
        />

        <Container className="relative">
          <div className="grid gap-6 md:grid-cols-2">
            {RULES.map((rule) => (
              <article
                key={rule.title}
                className="rounded-card border border-ink/10 bg-bone/85 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
              >
                <span className="grid size-12 place-items-center rounded-pill bg-brand text-bone">
                  <rule.icon className="size-5" />
                </span>
                <h2 className="mt-5 font-display text-xl text-ink">
                  {rule.title}
                </h2>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {rule.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-relaxed text-ink/65"
                    >
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {/* Чек-лист перед отправкой */}
          <div className="mt-8 rounded-card bg-ink p-8 text-bone shadow-lift grain sm:p-10">
            <h2 className="relative flex items-center gap-2.5 font-display text-xl sm:text-2xl">
              <TriangleAlert className="size-5 text-brand-bright" aria-hidden />
              Проверьте перед отправкой
            </h2>
            <ul className="relative mt-6 grid gap-3 sm:grid-cols-2">
              {CHECKLIST.map((item, i) => (
                <li key={item} className="flex gap-3 text-sm text-ice/75">
                  <span className="font-mono text-xs text-brand-bright">
                    0{i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="relative mt-7 text-sm text-ice/50">
              Сомневаетесь хоть в одном пункте - пришлите файл, проверим до
              запуска. Это бесплатно и быстрее, чем перепечатывать тираж.
            </p>
            <div className="relative mt-7">
              <ButtonLink href="/contacts" size="md">
                Отправить макет на проверку
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
