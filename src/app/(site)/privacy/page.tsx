import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import { PageHero } from "@/components/site/PageHero";
import { LegalDocument } from "@/components/site/LegalDocument";
import { privacy } from "@/lib/content/legal";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Политика конфиденциальности",
  description:
    "Порядок обработки персональных данных и меры по их защите в соответствии с Федеральным законом № 152-ФЗ.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/privacy"), "/privacy");
}

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Правовая информация"
        title={privacy.title}
        lead="Как мы собираем, храним и защищаем ваши персональные данные."
        breadcrumb={[{ href: "/privacy", label: "Конфиденциальность" }]}
      />
      <LegalDocument doc={privacy} />
    </>
  );
}
