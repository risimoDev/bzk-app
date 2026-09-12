import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { faq } from "@/lib/content/faq";
import { site } from "@/lib/site";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Вопросы и ответы",
  description:
    "Ответы на частые вопросы об услугах, заказе, оплате, сроках, доставке и гарантиях БЗК Принт.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/faq"), "/faq");
}

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="Справка"
        title="Частые вопросы"
        lead="Здесь собраны ответы про услуги, заказ, сроки, доставку и гарантии. Если нужного вопроса нет - напишите, ответим лично."
        breadcrumb={[{ href: "/faq", label: "Вопросы и ответы" }]}
      />

      <section className="torn-4 pb-16 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Container className="max-w-4xl">
          <div className="flex flex-col gap-10">
            {faq.map((category) => (
              <div key={category.title}>
                <h2 className="font-display text-2xl text-ink sm:text-3xl">
                  {category.title}
                </h2>

                <div className="mt-5 flex flex-col gap-3">
                  {category.questions.map((item) => (
                    /* <details> вместо кнопок на JS: работает без скриптов,
                       читается экранными читалками и ищется поиском браузера */
                    <details
                      key={item.question}
                      className="group rounded-card border border-ink/10 bg-bone/85 open:border-brand/40 open:shadow-press"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 font-medium text-ink marker:hidden hover:text-brand">
                        <span>{item.question}</span>
                        <Plus
                          aria-hidden
                          className="mt-0.5 size-5 shrink-0 text-brand transition-transform duration-200 group-open:rotate-45"
                        />
                      </summary>
                      <p className="px-5 pb-5 text-sm leading-relaxed text-ink/65">
                        {item.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-card bg-ink p-8 text-center text-bone shadow-lift grain sm:p-10">
            <h2 className="relative font-display text-2xl sm:text-3xl">
              Не нашли ответ?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-ice/70">
              Позвоните или напишите - разберёмся с вашей задачей и посчитаем
              стоимость.
            </p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href={site.phoneHref} size="md">
                Позвонить
              </ButtonLink>
              <ButtonLink
                href="/contacts"
                size="md"
                variant="outline"
                className="border-ice/40 text-bone hover:bg-bone hover:text-ink"
              >
                Написать
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
