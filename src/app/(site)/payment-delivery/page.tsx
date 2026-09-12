import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { Banknote, Building2, Wallet, Store, Truck, PackageCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { Decor, scrap } from "@/components/ui/Collage";
import { site } from "@/lib/site";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Оплата и доставка",
  description:
    "Способы оплаты - наличными, переводом, по договору. Самовывоз в Перми и доставка по городу, краю и в другие регионы.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/payment-delivery"), "/payment-delivery");
}

const PAYMENT = [
  {
    icon: Banknote,
    title: "Наличными в офисе",
    text: "При получении заказа. Чек выдаём на месте.",
  },
  {
    icon: Building2,
    title: "Банковским переводом",
    text: "Для юридических лиц и ИП. Счёт формируется после оформления заказа и приходит на почту.",
  },
  {
    icon: Wallet,
    title: "При получении",
    text: "Доступно при доставке по Перми.",
  },
  {
    icon: PackageCheck,
    title: "По договору",
    text: "Для постоянных клиентов - работа с постоплатой по согласованному графику.",
  },
];

const DELIVERY = [
  {
    icon: Store,
    title: "Самовывоз",
    price: "Бесплатно",
    text: `${site.address}. Забрать заказ можно в рабочие часы, о готовности сообщим заранее.`,
  },
  {
    icon: Truck,
    title: "Доставка по Перми",
    price: "от 300 ₽",
    text: "Точная стоимость зависит от адреса и объёма заказа. При заказе от определённой суммы доставка бесплатная.",
  },
  {
    icon: Truck,
    title: "Край и другие регионы",
    price: "По расчёту",
    text: "По Пермскому краю - своей доставкой, в другие регионы - транспортными компаниями.",
  },
];

export default function PaymentDeliveryPage() {
  return (
    <>
      <PageHero
        eyebrow="Условия"
        title="Оплата и доставка"
        lead="Принимаем оплату четырьмя способами. Заказ можно забрать в офисе или получить доставкой."
        breadcrumb={[{ href: "/payment-delivery", label: "Оплата и доставка" }]}
      />

      {/* ---------- Оплата ---------- */}
      <section className="relative overflow-hidden torn-2 pb-16 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Container className="relative">
          <h2 className="font-display text-3xl text-ink sm:text-4xl">Оплата</h2>
          <p className="mt-4 max-w-xl text-ink/65">
            Для новых клиентов и крупных заказов может потребоваться предоплата
            50–100%. При небольших заказах и для постоянных клиентов - как
            правило, нет.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PAYMENT.map((p) => (
              <article
                key={p.title}
                className="flex gap-5 rounded-card border border-ink/10 bg-bone/85 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-brand text-bone">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-lg text-ink">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
                    {p.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </Container>

      </section>

      {/* ---------- Доставка ---------- */}
      <section className="relative overflow-hidden torn-4 bg-ink pb-16 pt-24 text-bone grain sm:pb-20 sm:pt-28">
        <Decor
          asset={scrap.moneyStrip}
          className="absolute -right-16 bottom-10 hidden w-56 rotate-6 opacity-60 lg:block"
        />
        <Container className="relative">
          <h2 className="font-display text-3xl sm:text-4xl">Доставка</h2>
          <p className="mt-4 max-w-xl text-ice/65">
            О готовности заказа сообщаем сами - в личном кабинете и сообщением.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {DELIVERY.map((d) => (
              <article
                key={d.title}
                className="rounded-card border border-ice/10 bg-graphite/70 p-7 transition-colors hover:border-brand-bright/40"
              >
                <span className="grid size-11 place-items-center rounded-pill bg-brand-bright/15 text-brand-bright">
                  <d.icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-lg">{d.title}</h3>
                <p className="mt-1 font-mono text-2xl text-brand-bright">
                  {d.price}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ice/60">
                  {d.text}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4 rounded-card border border-ice/10 bg-graphite/50 p-7">
            <p className="min-w-0 flex-1 text-ice/70">
              Не уверены, какой способ подойдёт под ваш заказ? Позвоните -
              подскажем и посчитаем доставку заранее.
            </p>
            <ButtonLink href={site.phoneHref} size="md">
              {site.phone}
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
