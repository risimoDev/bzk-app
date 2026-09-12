"use server";

import { revalidatePath } from "next/cache";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { seoSettings } from "@/db/schema";
import { can } from "@/lib/permissions";
import { SEO_PAGES, type SeoPage } from "@/lib/seo";

export type SeoState = { ok: boolean; message?: string };

export async function saveSeo(_prev: SeoState, formData: FormData): Promise<SeoState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Менять SEO может администратор" };
  }

  const page = String(formData.get("page") ?? "");
  if (!(page in SEO_PAGES)) return { ok: false, message: "Неизвестная страница" };

  const field = (name: string, limit: number) =>
    String(formData.get(name) ?? "").trim().slice(0, limit) || null;

  const values = {
    page: page as SeoPage,
    title: field("title", 255),
    description: field("description", 2000),
    keywords: field("keywords", 2000),
    ogTitle: field("ogTitle", 255),
    ogDescription: field("ogDescription", 2000),
    ogImage: field("ogImage", 255),
  };

  // Картинка для соцсетей должна открываться снаружи: относительный путь
  // в og:image ленты не разворачивают
  if (values.ogImage && !/^https?:\/\/|^\//.test(values.ogImage)) {
    return { ok: false, message: "Адрес картинки - со слэша или с http" };
  }

  await db
    .insert(seoSettings)
    .values(values)
    .onConflictDoUpdate({
      target: seoSettings.page,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        keywords: sql`excluded.keywords`,
        ogTitle: sql`excluded.og_title`,
        ogDescription: sql`excluded.og_description`,
        ogImage: sql`excluded.og_image`,
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/admin/seo");
  revalidatePath(page);
  return { ok: true, message: `Сохранено для «${SEO_PAGES[page as SeoPage]}»` };
}

export async function clearSeo(_prev: SeoState, formData: FormData): Promise<SeoState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Менять SEO может администратор" };
  }

  const page = String(formData.get("page") ?? "");
  if (!(page in SEO_PAGES)) return { ok: false, message: "Неизвестная страница" };

  await db.delete(seoSettings).where(eq(seoSettings.page, page));

  revalidatePath("/admin/seo");
  revalidatePath(page);
  return { ok: true, message: "Настройки убраны - страница вернулась к своим текстам" };
}
