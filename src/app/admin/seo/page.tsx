import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/db";
import { seoSettings, products } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { SEO_PAGES, type SeoPage } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { SeoForm, type SeoValues } from "./SeoForm";

export const metadata: Metadata = {
  title: "SEO · Админка",
  robots: { index: false, follow: false },
};

/**
 * Что стоит в метаданных страницы, пока SEO не задано вручную. Значения
 * взяты из самих страниц - их видно в поле-подсказке, чтобы не
 * переписывать вслепую.
 */
const FALLBACK_TITLES: Record<SeoPage, string> = {
  "/": "БЗК Принт - рекламно-производственное агентство",
  "/catalog": "Каталог · БЗК Принт",
  "/about": "О компании · БЗК Принт",
  "/contacts": "Контакты · БЗК Принт",
  "/faq": "Вопросы и ответы · БЗК Принт",
  "/requirements": "Требования к макетам · БЗК Принт",
  "/payment-delivery": "Оплата и доставка · БЗК Принт",
  "/privacy": "Политика конфиденциальности · БЗК Принт",
  "/terms": "Условия использования · БЗК Принт",
};

const FALLBACK_DESCRIPTION =
  "Печать, сувенирная продукция и наружная реклама в Перми. Берём заказ целиком: подбираем исполнение под задачу, согласуем макет и держим сроки.";

const EMPTY: SeoValues = {
  title: "",
  description: "",
  keywords: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
};

export default async function AdminSeo() {
  if (!(await can("settings", "view"))) {
    return (
      <AdminPage title="SEO">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть настройки." />
      </AdminPage>
    );
  }

  const [rows, [catalogSize]] = await Promise.all([
    db.select().from(seoSettings),
    db.select({ n: count() }).from(products).where(eq(products.isHidden, false)),
  ]);

  const saved = new Map(rows.map((r) => [r.page, r]));
  const pages = Object.keys(SEO_PAGES) as SeoPage[];
  const configured = pages.filter((p) => saved.has(p)).length;

  // Карту сайта собирает /sitemap.ts: статические страницы плюс открытые
  // карточки товаров
  const sitemapSize = pages.length + Number(catalogSize?.n ?? 0);

  return (
    <AdminPage
      title="SEO"
      subtitle="Заголовки, описания и карточки для соцсетей"
      actions={
        <>
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            SITEMAP.XML
          </a>
          <a
            href="/robots.txt"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            ROBOTS.TXT
          </a>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat
          label="Страниц настроено"
          value={`${configured} из ${pages.length}`}
          tone={configured > 0 ? "brand" : "plain"}
        />
        <AdminStat
          label="Адресов в карте сайта"
          value={String(sitemapSize)}
          hint={`${pages.length} страниц и ${Number(catalogSize?.n ?? 0)} товаров`}
        />
        <AdminStat
          label="Публичный адрес"
          value={absoluteUrl("/").replace(/^https?:\/\//, "").replace(/\/$/, "")}
          hint="переменная SITE_URL"
        />
      </div>

      <p className="mt-5 max-w-3xl rounded-xl bg-navy/8 px-5 py-4 text-sm text-ink/70">
        Карта сайта и robots собираются кодом, а не лежат файлами. В старом
        sitemap.xml было шестнадцать адресов, среди них вход, регистрация и весь
        личный кабинет - те самые, которые robots.txt запрещал обходить; карточек
        товаров там не было ни одной. Теперь оба файла берут один и тот же список
        закрытых разделов, а товары подтягиваются из каталога.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {pages.map((page) => {
          const row = saved.get(page);
          const values: SeoValues = row
            ? {
                title: row.title ?? "",
                description: row.description ?? "",
                keywords: row.keywords ?? "",
                ogTitle: row.ogTitle ?? "",
                ogDescription: row.ogDescription ?? "",
                ogImage: row.ogImage ?? "",
              }
            : EMPTY;

          return (
            <SeoForm
              key={page}
              page={page}
              label={SEO_PAGES[page]}
              values={values}
              saved={Boolean(row)}
              fallbackTitle={FALLBACK_TITLES[page]}
              fallbackDescription={FALLBACK_DESCRIPTION}
            />
          );
        })}
      </div>
    </AdminPage>
  );
}
