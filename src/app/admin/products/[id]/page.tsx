import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc, desc } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/db";
import {
  products,
  categories,
  productQuantityPrices,
  productImages,
  productAttributes,
  attributeValues,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { ProductForm } from "../ProductForm";
import { PriceTierForm } from "./PriceTierForm";
import { ProductImages } from "./ProductImages";
import { AttributesEditor, type AttributeRow } from "./AttributesEditor";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Товар · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

export default async function AdminProduct(
  props: PageProps<"/admin/products/[id]">,
) {
  if (!(await can("products", "view"))) {
    return (
      <AdminPage title="Товар">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      basePrice: products.basePrice,
      unit: products.unit,
      minQuantity: products.minQuantity,
      multiplicity: products.multiplicity,
      isHidden: products.isHidden,
      isPopular: products.isPopular,
      categoryId: products.categoryId,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, Number(id)))
    .limit(1);

  if (!product) notFound();

  const [tiers, images, attrRows] = await Promise.all([
    db
      .select()
      .from(productQuantityPrices)
      .where(eq(productQuantityPrices.productId, product.id))
      .orderBy(asc(productQuantityPrices.minQty)),
    // Главное фото первым - так же, как в карточке на витрине
    db
      .select({
        id: productImages.id,
        imageUrl: productImages.imageUrl,
        isMain: productImages.isMain,
        kind: productImages.kind,
      })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(desc(productImages.isMain), asc(productImages.id)),
    db
      .select({
        id: productAttributes.id,
        name: productAttributes.name,
        valueId: attributeValues.id,
        value: attributeValues.value,
        priceModifier: attributeValues.priceModifier,
      })
      .from(productAttributes)
      .leftJoin(attributeValues, eq(attributeValues.attributeId, productAttributes.id))
      .where(eq(productAttributes.productId, product.id))
      .orderBy(asc(productAttributes.id), asc(attributeValues.id)),
  ]);

  // Характеристики приходят плоским списком после соединения - собираем.
  // Порядок значений тот же, что на витрине: по id
  const attributes: AttributeRow[] = [];
  for (const row of attrRows) {
    let attr = attributes.find((a) => a.id === row.id);
    if (!attr) {
      attr = { id: row.id, name: row.name, values: [] };
      attributes.push(attr);
    }
    if (row.valueId !== null && row.value !== null) {
      attr.values.push({ id: row.valueId, value: row.value, priceModifier: row.priceModifier });
    }
  }

  const editable = await can("products", "edit");
  const categoryList = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));

  return (
    <AdminPage
      title={product.name}
      subtitle={product.categoryName ?? "Без категории"}
      actions={
        <>
          <Link
            href={`/catalog/${product.id}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <ExternalLink className="size-4" aria-hidden />
            На витрине
          </Link>
          <Link
            href="/admin/products"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <ArrowLeft className="size-4" aria-hidden />
            К списку
          </Link>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section className="rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
          {!editable && (
            <p className="mb-5 rounded-lg bg-paper px-4 py-3 text-sm text-ink/60">
              У вашей роли нет права менять товары - поля только для чтения.
            </p>
          )}
          <ProductForm
            // is_popular в базе допускает NULL - для формы это просто «нет»
            product={{ ...product, isPopular: product.isPopular ?? false }}
            categoryList={categoryList}
            readOnly={!editable}
          />
        </section>

        <aside className="rounded-xl border border-ink/10 bg-bone p-5">
          <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
            Цены по тиражам
          </h2>

          {tiers.length === 0 && !editable && (
            <p className="mt-3 text-sm text-ink/50">
              Не заданы - считается базовая цена.
            </p>
          )}

          {editable ? (
            <div className="mt-2">
              {tiers.map((t) => (
                <PriceTierForm
                  key={t.id}
                  productId={product.id}
                  value={{
                    id: t.id,
                    minQty: t.minQty,
                    maxQty: t.maxQty,
                    price: t.price,
                  }}
                />
              ))}

              <div className="mt-3 border-t border-ink/10 pt-2">
                <p className="mb-1 font-display text-[0.58rem] tracking-[0.14em] text-ink/40">
                  НОВАЯ СТУПЕНЬ
                </p>
                <PriceTierForm productId={product.id} />
              </div>
            </div>
          ) : (
            tiers.length > 0 && (
              <div className="overflow-x-auto">
                {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left">
                      <th className="pb-2 font-display text-[0.58rem] tracking-[0.14em] text-ink/40">
                        Количество
                      </th>
                      <th className="pb-2 text-right font-display text-[0.58rem] tracking-[0.14em] text-ink/40">
                        Цена
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => (
                      <tr key={t.id} className="border-b border-ink/6 last:border-0">
                        <td className="py-2 font-mono text-xs text-ink/65">
                          {t.minQty}
                          {t.maxQty ? `–${t.maxQty}` : "+"}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-ink">
                          {money.format(Number(t.price))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          <p className={cn("mt-4 text-xs text-ink/45")}>
            Цену берёт последняя подходящая ступень. Надбавки за
            характеристики прибавляются к ней - они ниже, под формой.
          </p>
        </aside>

        <div className="lg:col-span-2">
          <AttributesEditor
            productId={product.id}
            attributes={attributes}
            readOnly={!editable}
          />
        </div>

        <div className="lg:col-span-2">
          <ProductImages
            productId={product.id}
            // is_main в базе допускает NULL - для разметки это просто «нет»
            images={images.map((i) => ({ ...i, isMain: i.isMain ?? false }))}
            readOnly={!editable}
          />
        </div>
      </div>
    </AdminPage>
  );
}
