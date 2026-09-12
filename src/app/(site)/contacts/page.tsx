import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { Phone, Mail, MapPin, Clock, Send } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { Decor, scribble, scrap } from "@/components/ui/Collage";
import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Контакты",
  description: `Адрес, телефон и часы работы БЗК Принт: ${site.address}. Телефон ${site.phone}.`,
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/contacts"), "/contacts");
}

const CHANNELS = [
  {
    icon: Phone,
    label: "Телефон",
    value: site.phone,
    href: site.phoneHref,
    note: "Звонок в рабочие часы - самый быстрый способ",
  },
  {
    icon: Mail,
    label: "Почта",
    value: site.email,
    href: `mailto:${site.email}`,
    note: "Пришлите задачу и макет - вернёмся с расчётом",
  },
  {
    icon: Send,
    label: "Telegram",
    value: "@bzkprint",
    href: "http://t.me/bzkprint",
    note: "Быстрые вопросы и согласование макетов",
  },
  {
    icon: MapPin,
    label: "Адрес",
    value: site.address,
    href: site.mapUrl,
    note: "Забрать заказ можно в офисе",
  },
];

export default function ContactsPage() {
  return (
    <>
      <PageHero
        eyebrow="Связаться"
        title="Контакты"
        lead="Позвоните, напишите или заезжайте в офис. На заявки с описанием задачи отвечаем расчётом и сроками."
        breadcrumb={[{ href: "/contacts", label: "Контакты" }]}
      />

      <section className="relative overflow-hidden torn-3 pb-16 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Decor
          asset={scribble.circleBlack}
          className="absolute -left-24 top-10 hidden w-72 opacity-10 lg:block"
        />

        <Container className="relative">
          <div className="grid gap-6 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="group flex gap-5 rounded-card border border-ink/10 bg-bone/85 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-brand text-bone transition-colors group-hover:bg-brand-bright">
                  <c.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="font-display text-xs tracking-[0.18em] text-ink/45">
                    {c.label}
                  </span>
                  <span className="mt-1 block text-lg font-semibold text-ink group-hover:text-brand">
                    {c.value}
                  </span>
                  <span className="mt-1.5 block text-sm text-ink/55">
                    {c.note}
                  </span>
                </span>
              </a>
            ))}
          </div>

          <div className="mt-6">
            <ContactForm />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            {/* Часы работы - «наклеенный» листок */}
            <div className="relative">
              <Decor
                asset={scrap.paperStrip}
                className="pointer-events-none absolute -top-4 left-6 hidden w-40 -rotate-3 opacity-90 sm:block"
              />
              <div className="tape-tilt rounded-card bg-ink p-8 text-bone shadow-lift grain">
                <h2 className="relative flex items-center gap-2 font-display text-sm tracking-[0.2em] text-ice/50">
                  <Clock className="size-4" aria-hidden />
                  Часы работы
                </h2>
                <dl className="relative mt-6 flex flex-col gap-3">
                  {site.hours.map((h) => (
                    <div
                      key={h.days}
                      className="flex items-baseline justify-between gap-4 border-b border-ice/10 pb-3 last:border-0"
                    >
                      <dt className="text-ice/60">{h.days}</dt>
                      <dd className="font-mono text-lg text-bone">{h.time}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Карта */}
            <div className="overflow-hidden rounded-card border border-ink/10 bg-bone shadow-press">
              <iframe
                title="Офис БЗК Принт на карте"
                src="https://yandex.ru/map-widget/v1/?ll=56.180496%2C58.007562&z=17&pt=56.180496,58.007562,pm2gnm"
                className="h-80 w-full border-0 lg:h-full lg:min-h-[22rem]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
