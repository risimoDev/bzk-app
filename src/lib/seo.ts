import type { Metadata } from "next";

/**
 * Настройки SEO по страницам.
 *
 * В таблице seo_settings лежит заголовок, описание и данные для соцсетей
 * для каждого публичного адреса. Если записи нет, страница остаётся со
 * своими значениями по умолчанию - принудительно затирать их пустотой
 * из базы нельзя.
 *
 * Здесь только словари и наложение значений: файл подключает клиентская
 * форма настроек, а чтение из базы живёт в seo-db.ts.
 */

/** Публичные страницы, которым имеет смысл задавать SEO. */
export const SEO_PAGES = {
  "/": "Главная",
  "/catalog": "Каталог",
  "/about": "О компании",
  "/contacts": "Контакты",
  "/faq": "Вопросы и ответы",
  "/requirements": "Требования к макетам",
  "/payment-delivery": "Оплата и доставка",
  "/privacy": "Политика конфиденциальности",
  "/terms": "Условия использования",
} as const;

export type SeoPage = keyof typeof SEO_PAGES;

/**
 * Страницы, которые не должны попадать ни в карту сайта, ни в индекс:
 * кабинет, вход и всё, что за ним.
 */
export const PRIVATE_PREFIXES = [
  "/admin",
  "/client",
  "/api",
  "/print",
  "/login",
  "/register",
  "/cart",
  "/favorites",
];

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export type SeoRecord = {
  title: string | null;
  description: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
};

/**
 * Накладывает настройки поверх метаданных страницы.
 *
 * Пустое поле в базе означает «ничего не задано», а не «сделать пустым»:
 * такие поля пропускаем и оставляем то, что написано в самой странице.
 */
export function applySeo(
  base: Metadata,
  seo: SeoRecord | null,
  path: string,
): Metadata {
  /**
   * Канонический адрес страницы. Ставим всегда, даже когда своих
   * настроек SEO нет: к адресу цепляются метки рекламы и параметры
   * старого сайта - редиректы вида `/service?id=7` уводят на
   * `/catalog/7?id=7`, потому что Next переносит строку запроса на
   * новый адрес. Без канонической ссылки поисковик считает такой
   * адрес отдельной страницей и делит между ними вес.
   */
  const canonical = { alternates: { canonical: path } };

  if (!seo) return { ...base, ...canonical };

  const text = (v: string | null) => {
    const t = v?.trim();
    return t ? t : undefined;
  };

  const title = text(seo.title);
  const description = text(seo.description);
  const keywords = text(seo.keywords);
  const ogTitle = text(seo.ogTitle) ?? title;
  const ogDescription = text(seo.ogDescription) ?? description;
  const ogImage = text(seo.ogImage);

  const openGraph =
    ogTitle || ogDescription || ogImage
      ? {
          ...base.openGraph,
          ...(ogTitle ? { title: ogTitle } : {}),
          ...(ogDescription ? { description: ogDescription } : {}),
          ...(ogImage ? { images: [{ url: ogImage }] } : {}),
        }
      : base.openGraph;

  return {
    ...base,
    ...canonical,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    // keywords в базе одной строкой через запятую, Next ждёт список
    ...(keywords ? { keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) } : {}),
    ...(openGraph ? { openGraph } : {}),
  };
}

/** Длины, за которыми поисковики обрезают выдачу. */
export const SEO_LIMITS = {
  title: 60,
  description: 160,
} as const;
