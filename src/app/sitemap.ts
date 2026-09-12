import type { MetadataRoute } from "next";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { absoluteUrl } from "@/lib/site";

/**
 * Карта сайта.
 *
 * Собирается из кода и базы, а не пишется руками, как раньше. В старом
 * sitemap.xml было шестнадцать адресов, среди них /login, /register и
 * весь /client - те самые, которые robots.txt запрещал обходить. Карточек
 * товаров там не было вовсе, хотя ради них каталог и существует.
 */

/** Статические страницы витрины. */
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/catalog", priority: 0.9, changeFrequency: "daily" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contacts", priority: 0.8, changeFrequency: "monthly" },
  { path: "/requirements", priority: 0.7, changeFrequency: "monthly" },
  { path: "/payment-delivery", priority: 0.7, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // У товара нет отметки времени изменения - только дата создания.
  // Скрытые в каталог не попадают, значит и в карту сайта тоже
  const catalog = await db
    .select({ id: products.id, createdAt: products.createdAt })
    .from(products)
    .where(eq(products.isHidden, false))
    .orderBy(desc(products.createdAt));

  return [
    ...PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...catalog.map((p) => ({
      url: absoluteUrl(`/catalog/${p.id}`),
      lastModified: p.createdAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
