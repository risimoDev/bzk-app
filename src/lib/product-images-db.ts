import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";

/**
 * Картинка товара для списков - каталога, избранного, поиска.
 *
 * Подзапрос сгруппированный, а не соединение напрямую: ничто в схеме не
 * мешает товару иметь две записи с `is_main`, и тогда `leftJoin` вернул
 * бы товар дважды. Эти грабли уже ловились.
 *
 * Отдаёт обе колонки сразу, а `coalesce` считается в разметке:
 * ссылка на колонку подзапроса внутри `sql` рендерится без имени
 * подзапроса, и в выражении снаружи на это лучше не полагаться.
 */
export function catalogImages() {
  return db
    .select({
      productId: productImages.productId,
      logoUrl: sql<
        string | null
      >`min(${productImages.imageUrl}) filter (where ${productImages.kind} = 'logo')`.as(
        "logo_url",
      ),
      photoUrl: sql<
        string | null
      >`min(${productImages.imageUrl}) filter (where ${productImages.kind} <> 'logo' and ${productImages.isMain})`.as(
        "photo_url",
      ),
    })
    .from(productImages)
    .groupBy(productImages.productId)
    .as("catalog_image");
}
