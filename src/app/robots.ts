import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site";
import { PRIVATE_PREFIXES } from "@/lib/seo";

/**
 * robots.txt.
 *
 * Список закрытых разделов один и тот же, что у карты сайта, - берётся из
 * PRIVATE_PREFIXES. В старом robots.txt он расходился с sitemap.xml:
 * кабинет и вход были и запрещены, и перечислены в карте.
 *
 * Crawl-delay и Host из старого файла не переносим: Google их никогда не
 * понимал, а Яндекс перестал - с 2018 года скорость обхода задаётся в
 * Вебмастере, а главное зеркало определяется редиректом.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Без хвостового слэша: по правилам robots путь сопоставляется
      // префиксом, поэтому «/login» закрывает и саму страницу, и всё под
      // ней, а «/login/» саму страницу пропускал бы
      disallow: [...PRIVATE_PREFIXES],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl,
  };
}
