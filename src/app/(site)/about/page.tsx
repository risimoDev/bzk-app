import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { Decor, clip, scribble, scrap } from "@/components/ui/Collage";
import { production } from "@/lib/assets";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "О компании",
  description:
    "БЗК Принт - рекламно-производственное агентство в Перми. Берём заказ целиком: от макета и подбора материалов до готового тиража.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/about"), "/about");
}

const VALUES = [
  {
    title: "Задача, а не позиция прайса",
    text: "Начинаем с того, что вам нужно получить, а не с того, что проще напечатать. Иногда правильный ответ - другой формат или другой материал, чем тот, с которым к нам пришли.",
  },
  {
    title: "Один ответственный за заказ",
    text: "У заказа есть менеджер, который ведёт его от заявки до выдачи. Не приходится пересказывать задачу заново каждому, кто взял трубку.",
  },
  {
    title: "Честные сроки",
    text: "Называем срок, который выдержим, а не тот, который приятно услышать. Если что-то смещается - сообщаем сами, до того как вы спросите.",
  },
  {
    title: "Проверка до тиража",
    text: "Макет проверяем на вылеты, разрешение и цветовую модель до запуска. На больших тиражах предлагаем цветопробу - дешевле, чем перепечатать всё.",
  },
];

const NUMBERS = [
  { value: "100+", label: "выполненных проектов" },
  { value: "4+", label: "года работы" },
  { value: "99%", label: "заказов принято без замечаний" },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="О компании"
        title="Рекламно-производственное агентство в Перми"
        lead="Берём заказ целиком: разбираемся в задаче, подбираем исполнение, согласуем макет и доводим до готового тиража."
        breadcrumb={[{ href: "/about", label: "О компании" }]}
      />

      {/* ---------- Кто мы ---------- */}
      <section className="relative overflow-hidden torn-5 pb-16 pt-24 paper-light sm:pb-24 sm:pt-32">
        <Decor
          asset={scribble.tangleBlack}
          className="absolute -right-24 top-8 hidden w-80 opacity-10 lg:block"
        />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl text-ink sm:text-4xl">
                Что мы делаем
              </h2>
              <div className="mt-6 flex flex-col gap-5 text-ink/70">
                <p>
                  БЗК Принт закрывает рекламные и полиграфические задачи бизнеса:
                  печать и постпечатная обработка, сувенирная продукция,
                  наружная реклама, упаковка и всё, что к этому прилагается -
                  от подготовки макета до готового тиража.
                </p>
                <p>
                  Клиенту не нужно собирать заказ по нескольким исполнителям и
                  сводить между ними сроки. Вы описываете задачу, мы предлагаем
                  варианты исполнения с ценой и сроком, а дальше ведём заказ
                  и отвечаем за результат.
                </p>
                <p>
                  Если бюджет или срок не сходятся с первоначальной идеей -
                  скажем об этом сразу и предложим, что можно поменять:
                  материал, способ печати, тираж или отделку.
                </p>
              </div>

              <div className="mt-10 flex flex-wrap gap-4">
                <ButtonLink href="/catalog" size="md">
                  Посмотреть каталог
                </ButtonLink>
                <ButtonLink href="/contacts" size="md" variant="outline">
                  Обсудить задачу
                </ButtonLink>
              </div>
            </div>

            {/* Цифры - наклеенный листок */}
            <div className="relative">
              <Decor
                asset={clip.steel}
                className="absolute -top-6 left-10 z-10 w-9 rotate-[10deg] drop-shadow-md"
              />
              <div className="tape-tilt rounded-card bg-ink p-8 text-bone shadow-lift grain">
                <h3 className="relative font-display text-sm tracking-[0.2em] text-ice/50">
                  Коротко
                </h3>
                <dl className="relative mt-7 flex flex-col gap-7">
                  {NUMBERS.map((n) => (
                    <div key={n.label}>
                      <dt className="font-mono text-4xl font-bold text-brand-bright">
                        {n.value}
                      </dt>
                      <dd className="mt-1 text-sm text-ice/60">{n.label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </Container>

      </section>

      {/* ---------- Принципы ---------- */}
      <section className="relative overflow-hidden torn-1 bg-ink pb-16 pt-24 text-bone grain sm:pb-24 sm:pt-32">
        <Decor
          asset={scrap.edgeThin}
          className="absolute -right-10 top-0 hidden h-full w-32 opacity-15 lg:block"
        />
        <Container className="relative">
          <p className="font-display text-sm tracking-[0.28em] text-brand-bright">
            Как мы работаем
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl leading-tight sm:text-4xl">
            Четыре вещи, за которые к нам возвращаются
          </h2>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {VALUES.map((v, i) => (
              <article
                key={v.title}
                className="rounded-card border border-ice/10 bg-graphite/70 p-7 transition-colors hover:border-brand-bright/40"
              >
                <span className="font-mono text-sm text-brand-bright">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-display text-xl leading-tight">
                  {v.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ice/65">
                  {v.text}
                </p>
              </article>
            ))}
          </div>

          <ul className="mt-14 grid gap-4 sm:grid-cols-3">
            {[production["press-02"], production["press-04"], production["press-06"]].map(
              (shot, i) => (
                <li
                  key={shot.src}
                  className="relative aspect-4/3 overflow-hidden rounded-card"
                >
                  <Image
                    src={shot.src}
                    alt={
                      [
                        "Печатное оборудование",
                        "Постпечатная обработка",
                        "Готовая продукция",
                      ][i]
                    }
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover grayscale transition-all duration-500 hover:grayscale-0"
                  />
                </li>
              ),
            )}
          </ul>
        </Container>

      </section>

      {/* ---------- Призыв ---------- */}
      <section className="torn-3 bg-brand-deep pb-16 pt-24 text-bone grain sm:pb-20 sm:pt-28">
        <Container className="relative text-center">
          <h2 className="mx-auto max-w-xl font-display text-3xl leading-tight sm:text-4xl">
            Расскажите задачу - посчитаем сегодня
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink
              href="/contacts"
              size="lg"
              className="bg-bone text-ink hover:bg-mint"
            >
              Оставить заявку
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
