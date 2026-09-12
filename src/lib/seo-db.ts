import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { seoSettings } from "@/db/schema";
import type { SeoRecord } from "@/lib/seo";

/**
 * Чтение SEO-настроек страницы.
 *
 * Отдельно от словарей: те подключает клиентская форма в админке, и
 * вместе с ними в браузерный бандл уезжал бы драйвер Postgres.
 */
export async function readSeo(page: string): Promise<SeoRecord | null> {
  const [row] = await db
    .select({
      title: seoSettings.title,
      description: seoSettings.description,
      keywords: seoSettings.keywords,
      ogTitle: seoSettings.ogTitle,
      ogDescription: seoSettings.ogDescription,
      ogImage: seoSettings.ogImage,
    })
    .from(seoSettings)
    .where(eq(seoSettings.page, page))
    .limit(1);

  return row ?? null;
}
