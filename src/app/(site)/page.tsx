import type { Metadata } from "next";
import Image from "next/image";
import { FileText, PenTool, Settings2, ShieldCheck } from "lucide-react";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Decor, clip, scribble, scrap } from "@/components/ui/Collage";
import { production } from "@/lib/assets";
import { HeroVideo } from "@/components/site/HeroVideo";
import { TapeLabel } from "@/components/ui/TapeLabel";
import { PixelCursor } from "@/components/ui/PixelCursor";
import { StampBadge } from "@/components/ui/StampBadge";
import { ClippedCard } from "@/components/ui/ClippedCard";
import { organizationJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { site } from "@/lib/site";

/**
 * У главной свои заголовок и описание заданы в корневом layout - здесь
 * пусто, чтобы шаблон оттуда не переопределялся зря. Настройки из админки
 * накладываются поверх, если они заведены.
 */
export async function generateMetadata(): Promise<Metadata> {
  return applySeo({}, await readSeo("/"), "/");
}

const STEPS = [
  {
    icon: FileText,
    title: "Заявка",
    note: "Обсуждаем задачу и считаем стоимость",
  },
  { icon: PenTool, title: "Макет", note: "Согласуем и готовим файлы к печати" },
  {
    icon: Settings2,
    title: "Производство",
    note: "Печать и постпечатная обработка",
  },
  {
    icon: ShieldCheck,
    title: "Готовый заказ",
    note: "Проверяем качество и передаём вам",
    stamp: "ОТК Пройдено",
  },
];

/** Что реально делаем - по разделам каталога, без выдуманных цифр. */
const SCOPE = [
  "Визитки, листовки, буклеты",
  "Баннеры и таблички",
  "Наклейки и этикетки",
  "Кружки, футболки, сувенирка",
  "Широкоформатная печать",
  "Макет и дизайн",
];

const ADVANTAGES = [
  {
    title: "Одно окно на любую задачу",
    text: "Печать, сувенирная продукция, наружная реклама и постпечать. Не нужно собирать заказ по нескольким исполнителям и сводить сроки между ними.",
    tag: "Комплексно",
  },
  {
    title: "Решение под задачу и бюджет",
    text: "Считаем нестандартные тиражи и форматы. Если смета или срок не сходятся, предложим другой материал или способ исполнения.",
    tag: "Гибко",
  },
  {
    title: "Заказ виден на каждом этапе",
    text: "Личный кабинет показывает стадию заказа в реальном времени. Не нужно звонить менеджеру, чтобы узнать, что происходит.",
    tag: "Прозрачно",
  },
];

const WORK = [
  { asset: production["press-01"], caption: "Резка и раскрой" },
  { asset: production["press-03"], caption: "Печать" },
  { asset: production["press-05"], caption: "Постпечатная обработка" },
  { asset: production["press-07"], caption: "Готовые тиражи" },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd()) }}
      />

      {/* ---------- Обложка (Брендбук 2026) ---------- */}
      <section className="relative overflow-hidden bg-ink text-bone grain">
        <HeroVideo />

        {/* Угловой коллаж брендбука: купюра + тетрадная клетка + скрепка */}
        <Decor
          asset={scrap.cornerMoney}
          priority
          className="absolute -right-10 -top-8 hidden w-72 rotate-[4deg] drop-shadow-2xl opacity-90 lg:block z-10 pointer-events-none"
        />

        <Decor
          asset={scribble.zigzagWhite}
          priority
          className="absolute -left-24 top-0 hidden w-[24rem] opacity-50 mix-blend-screen sm:block"
        />
        <Decor
          asset={scribble.starWhite}
          className="absolute right-[14%] bottom-20 hidden w-40 -rotate-12 opacity-35 mix-blend-screen sm:block"
        />
        <Decor
          asset={clip.mint}
          priority
          className="absolute right-[18%] -top-4 w-14 rotate-[14deg] drop-shadow-lg sm:w-20 z-20"
        />

        <Container className="relative py-24 sm:py-32 lg:py-40">
          <div className="flex flex-wrap items-center gap-3">
            {/* Город на узком экране прячем: плашка не помещалась в
                ширину телефона и обрезалась краем */}
            <TapeLabel variant="brand" tilt="left">
              Рекламно-производственное агентство
              <span className="hidden sm:inline">&nbsp;· Пермь</span>
            </TapeLabel>
          </div>

          <h1 className="mt-7 max-w-4xl font-display text-[clamp(2.75rem,8vw,6rem)] leading-[0.92] text-bone">
            Печать, сувениры
            <br />
            <span className="text-brand-bright">и наружная реклама</span> под
            ключ
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ice/75">
            Подбираем исполнение под задачу и бюджет, согласуем макет и сдаём
            в срок. Цена за тираж видна сразу в карточке товара, а как идёт
            заказ - в личном кабинете.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <div className="relative inline-block">
              <ButtonLink href="/catalog" size="lg">
                Смотреть весь каталог
              </ButtonLink>
              <PixelCursor
                size={34}
                className="absolute -bottom-4 -right-3 hidden sm:block animate-bounce z-10"
              />
            </div>
            <ButtonLink
              href="/contacts"
              size="lg"
              variant="outline"
              className="border-ice/40 text-bone hover:bg-bone hover:text-ink"
            >
              Обсудить проект
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* ---------- Как мы работаем (Титульный лист со скрепкой) ---------- */}
      <section className="relative torn-1 pb-20 pt-28 paper-light sm:pb-28 sm:pt-36">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1.6fr_1fr] lg:items-start">
            <div>
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-4xl text-navy sm:text-5xl">
                  Как мы работаем
                </h2>
              </div>
              <p className="mt-4 max-w-lg text-ink/65">
                От заявки до готового тиража - четыре шага. На каждом с вами на
                связи менеджер, а если нужен макет, подключим дизайнера.
              </p>

              <ol className="mt-10 grid gap-4 sm:grid-cols-2">
                {STEPS.map((step, i) => (
                  <li
                    key={step.title}
                    className="group relative rounded-card border border-ink/10 bg-bone/85 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid size-11 place-items-center rounded-pill bg-brand text-bone transition-colors group-hover:bg-brand-bright shadow-sm">
                        <step.icon className="size-5" />
                      </span>
                      <TapeLabel variant="light" size="sm" tilt="none" className="font-mono">
                        0{i + 1}
                      </TapeLabel>
                    </div>
                    <h3 className="mt-5 font-display text-xl text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-ink/55">{step.note}</p>
                    {step.stamp && (
                      <div className="mt-4">
                        <StampBadge variant="ok" className="text-[0.62rem]">
                          {step.stamp}
                        </StampBadge>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* Что печатаем - приколотый лист со скрепкой */}
            <div className="relative">
              <ClippedCard clipType="steel" clipPosition="top-left" paper="dark" tilt={true}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm tracking-[0.22em] text-ice/50">
                    Что печатаем
                  </h3>
                  <TapeLabel variant="brand" size="sm" tilt="right">
                    Коротко
                  </TapeLabel>
                </div>
                <ul className="relative mt-6 flex flex-col gap-3">
                  {SCOPE.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-ice/80">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-bright" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-ice/12 pt-4 text-xs leading-relaxed text-ice/55">
                  Нужно что-то своё - позвоните{" "}
                  <a href={site.phoneHref} className="whitespace-nowrap text-brand-bright hover:underline">
                    {site.phone}
                  </a>
                  , подскажем по материалу и посчитаем.
                </p>
              </ClippedCard>
            </div>
          </div>
        </Container>
      </section>

      {/* ---------- Направления ---------- */}
      <section className="relative overflow-hidden torn-2 bg-ink pb-20 pt-28 text-bone grain sm:pb-24 sm:pt-32">
        <Decor
          asset={scrap.edgeDiagonal}
          className="absolute -right-20 top-6 hidden w-72 rotate-6 opacity-20 lg:block"
        />
        <Container className="relative">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <TapeLabel variant="brand" size="sm" tilt="left">
                Направления
              </TapeLabel>
              <h2 className="mt-4 max-w-lg font-display text-4xl leading-tight sm:text-5xl">
                От макета до готового тиража
              </h2>
            </div>
            <p className="max-w-sm text-ice/65">
              Берём заказ целиком: подбираем материалы и технологию под задачу,
              согласуем макет и держим качество и сроки на каждом этапе.
            </p>
          </div>

          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORK.map((shot, i) => (
              <li
                key={shot.caption}
                className="group relative overflow-hidden rounded-card bg-graphite border border-ink/40 transition-all duration-300 hover:border-brand/50 hover:shadow-lift"
              >
                <div className="relative aspect-4/3 overflow-hidden">
                  <Image
                    src={shot.asset.src}
                    alt={shot.caption}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0"
                  />
                  <div className="absolute left-3 top-3">
                    <TapeLabel
                      variant={i % 2 === 0 ? "light" : "yellow"}
                      size="sm"
                      tilt={i % 2 === 0 ? "left" : "right"}
                    >
                      Этап {i + 1}
                    </TapeLabel>
                  </div>
                </div>
                <p className="px-4 py-3 font-display text-sm tracking-wide text-ice/80">
                  {shot.caption}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ---------- Почему выбирают нас ---------- */}
      <section className="relative overflow-hidden torn-3 pb-20 pt-28 paper-mint sm:pb-28 sm:pt-36">
        <Decor
          asset={scribble.circleBlack}
          className="absolute -right-16 top-8 hidden w-80 -rotate-6 opacity-15 lg:block"
        />
        <Decor
          asset={scrap.moneyStrip}
          className="absolute -left-20 bottom-20 hidden w-64 -rotate-6 opacity-80 md:block"
        />
        <Container className="relative">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-4xl text-navy sm:text-5xl">
              Почему выбирают нас
            </h2>
            <StampBadge variant="ok" className="hidden sm:inline-flex text-[0.65rem]">
              Проверено ОТК
            </StampBadge>
          </div>
          <p className="mt-4 max-w-xl text-ink/65">
            Мы совмещаем технологичность и внимание к деталям.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <ClippedCard
                key={a.title}
                clipType={i === 0 ? "mint" : i === 1 ? "steel" : "binder"}
                clipPosition={i === 2 ? "top-center" : "top-left"}
                paper="light"
                className="hover:-translate-y-1.5 hover:shadow-lift"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-brand">0{i + 1}</span>
                  <TapeLabel variant="yellow" size="sm" tilt="right">
                    {a.tag}
                  </TapeLabel>
                </div>
                <h3 className="mt-4 font-display text-2xl leading-tight text-ink">
                  {a.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/60">
                  {a.text}
                </p>
              </ClippedCard>
            ))}
          </div>
        </Container>
      </section>

      {/* ---------- Призыв к действию ---------- */}
      <section className="relative overflow-hidden torn-4 bg-brand-deep pb-20 pt-28 text-bone grain sm:pb-24 sm:pt-32">
        <Container className="relative text-center">
          <div className="mb-4">
            <StampBadge
              variant="brand"
              className="text-brand-bright border-brand-bright/60 bg-brand-bright/10 text-xs"
            >
              Собственное производство
            </StampBadge>
          </div>
          <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
            Расскажите задачу - посчитаем сегодня
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-ice/75">
            Пришлите описание, и мы вернёмся с расчётом и сроками.
          </p>
          <div className="mt-9 flex flex-wrap justify-center items-center gap-4">
            <div className="relative inline-block">
              <ButtonLink
                href="/contacts"
                size="lg"
                className="bg-bone text-ink hover:bg-mint"
              >
                Оставить заявку
              </ButtonLink>
              <PixelCursor
                size={30}
                className="absolute -bottom-4 -right-3 hidden sm:block z-10"
              />
            </div>
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
    </>
  );
}
