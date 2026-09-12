import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { PageHero } from "@/components/site/PageHero";
import { LegalDocument } from "@/components/site/LegalDocument";
import { terms } from "@/lib/content/legal";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Условия использования",
  description:
    "Правила пользования сайтом БЗК Принт, оформления заказов и взаимных обязательств сторон.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/terms"), "/terms");
}

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Правовая информация"
        title={terms.title}
        lead="Правила пользования сайтом и оформления заказов."
        breadcrumb={[{ href: "/terms", label: "Условия использования" }]}
      />
      <LegalDocument doc={terms} />
    </>
  );
}
