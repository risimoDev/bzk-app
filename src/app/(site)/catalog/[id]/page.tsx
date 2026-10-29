import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, asc, desc } from "drizzle-orm";
import { Package, Ruler, Layers } from "lucide-react";
import { db } from "@/db";
import {
  products,
  categories,
  productImages,
  productQuantityPrices,
  productAttributes,
  attributeValues,
} from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { Decor, scribble } from "@/components/ui/Collage";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { productJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { AddToCartForm } from "@/components/catalog/AddToCartForm";
import { ReviewForm } from "@/components/site/ReviewForm";
import { TapeLabel } from "@/components/ui/TapeLabel";
import { StampBadge } from "@/components/ui/StampBadge";
import { ClippedCard } from "@/components/ui/ClippedCard";
import { currentUser } from "@/auth";
import { reviews } from "@/db/schema";
import { hasReviewableOrder } from "@/lib/reviews-db";
import { fromUnitPrice } from "@/lib/product-price";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const reviewDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const getProduct = cache(async (id: number) => {
  const [item] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      basePrice: products.basePrice,
      unit: products.unit,
      minQuantity: products.minQuantity,
      multiplicity: products.multiplicity,
      isPopular: products.isPopular,
      itemWidthMm: products.itemWidthMm,
      itemHeightMm: products.itemHeightMm,
      categoryId: products.categoryId,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, id), eq(products.isHidden, false)))
    .limit(1);

  if (!item) return null;

  const [images, tiers, attrs] = await Promise.all([
    // Главное фото первым: оно открывает галерею
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(desc(productImages.isMain), asc(productImages.id)),
    db
      .select()
      .from(productQuantityPrices)
      .where(eq(productQuantityPrices.productId, id))
      .orderBy(asc(productQuantityPrices.minQty)),
    db
      .select({
        attrId: productAttributes.id,
        attrName: productAttributes.name,
        valueId: attributeValues.id,
        value: attributeValues.value,
        priceModifier: attributeValues.priceModifier,
      })
      .from(productAttributes)
      .leftJoin(
        attributeValues,
        eq(attributeValues.attributeId, productAttributes.id),
      )
      .where(eq(productAttributes.productId, id))
      .orderBy(asc(productAttributes.id), asc(attributeValues.id)),
  ]);

  // Характеристики приходят плоским списком после join - группируем.
  // Левое соединение делает value и valueId необязательными: у характеристики
  // может не быть ни одного значения. Такие строки отбрасываем здесь,
  // чтобы дальше по коду не тащить null.
  type AttrValue = { valueId: number; value: string; priceModifier: string | null };
  const grouped = new Map<number, { name: string; values: AttrValue[] }>();

  for (const row of attrs) {
    if (!grouped.has(row.attrId)) {
      grouped.set(row.attrId, { name: row.attrName, values: [] });
    }
    if (row.valueId !== null && row.value !== null) {
      grouped.get(row.attrId)!.values.push({
        valueId: row.valueId,
        value: row.value,
        priceModifier: row.priceModifier,
      });
    }
  }

  // Характеристика без значений выбирать нечего - не показываем
  const attributes = [...grouped.values()].filter((a) => a.values.length > 0);

  // В галерею карточки идут только фотографии готовых работ. Логотип -
  // картинка для сетки каталога; сюда он попадает лишь запасным
  // вариантом, пока фотографий нет
  const photos = images.filter((i) => i.kind !== "logo");
  const logo = images.find((i) => i.kind === "logo") ?? null;

  return { item, photos, logo, tiers, attributes };
});

export async function generateMetadata(
  props: PageProps<"/catalog/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  // Не «только цифры», а id в пределах integer: /catalog/99999999999
  // проходил проверку цифрами и ронял запрос переполнением
  const productId = parseId(id);
  const data = productId === null ? null : await getProduct(productId);
  // Статус 404 для несуществующего товара отдаёт proxy.ts: отсюда и из
  // страницы notFound() приходит уже после loading.tsx, когда ответ начат
  if (!data) return { title: "Товар не найден" };

  const description =
    data.item.description?.slice(0, 160) ??
    `${data.item.name} - расчёт стоимости под ваш тираж.`;
  // Картинка для превью ссылки в мессенджерах: фото работы, а если его
  // нет - логотип. Без неё ссылка на товар в телеграме приходит голым текстом
  const cover = data.photos[0]?.imageUrl ?? data.logo?.imageUrl;

  return {
    title: data.item.name,
    description,
    openGraph: {
      type: "website",
      title: data.item.name,
      description,
      url: `/catalog/${id}`,
      ...(cover ? { images: [{ url: cover, alt: data.item.name }] } : {}),
    },
    // Со старого сайта товар открывался как `/service?id=7`, и редирект
    // переносит `?id=7` сюда же. Каноническая ссылка сводит такие адреса
    // к одному, иначе поисковик считает их разными страницами
    alternates: { canonical: `/catalog/${id}` },
  };
}

export default async function ProductPage(props: PageProps<"/catalog/[id]">) {
  const { id } = await props.params;
  const productId = parseId(id);
  if (productId === null) notFound();

  const data = await getProduct(productId);
  if (!data) notFound();

  const user = await currentUser();

  // Отзыв показываем только одобренный: очередь модерации живёт в
  // админке, и черновики покупателю видеть незачем
  const approved = await db
    .select({
      id: reviews.id,
      name: reviews.name,
      rating: reviews.rating,
      message: reviews.message,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  // Форму показываем тому, кто этот товар получил (заказ отправлен или
  // завершён) и ещё не высказался: сервер проверит то же самое, но пустая
  // форма «не для вас» раздражает
  const canReview = user
    ? await (async () => {
        if (!(await hasReviewableOrder(Number(user.id), productId))) return false;

        const [own] = await db
          .select({ id: reviews.id })
          .from(reviews)
          .where(
            and(eq(reviews.productId, productId), eq(reviews.userId, Number(user.id))),
          )
          .limit(1);
        return !own;
      })()
    : false;

  const averageRating =
    approved.length > 0
      ? approved.reduce((sum, r) => sum + Number(r.rating), 0) / approved.length
      : null;

  const { item, photos, logo, tiers, attributes } = data;

  // «От» - цена за единицу при минимальном тираже, а не базовая: так же
  // посчитает корзина
  const fromPrice = fromUnitPrice({
    basePrice: item.basePrice,
    tiers: tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: t.price })),
    minQuantity: item.minQuantity,
    multiplicity: item.multiplicity,
  });

  const size =
    item.itemWidthMm && item.itemHeightMm
      ? `${Number(item.itemWidthMm)}×${Number(item.itemHeightMm)} мм`
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            productJsonLd({
              id: item.id,
              name: item.name,
              description: item.description,
              imageUrl: photos[0]?.imageUrl ?? logo?.imageUrl ?? null,
              basePrice: String(fromPrice),
              tierPrices: tiers.map((t) => t.price),
              rating:
                averageRating !== null
                  ? { value: averageRating, count: approved.length }
                  : null,
            }),
          ),
        }}
      />

      <PageHero
        eyebrow={item.categoryName ?? "Каталог"}
        title={item.name}
        breadcrumb={[
          { href: "/catalog", label: "Каталог" },
          ...(item.categoryId && item.categoryName
            ? [
                {
                  href: `/catalog?category=${item.categoryId}`,
                  label: item.categoryName,
                },
              ]
            : []),
          { href: `/catalog/${item.id}`, label: item.name },
        ]}
      />

      <section className="relative overflow-hidden torn-1 pb-16 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Decor
          asset={scribble.circleBlack}
          className="absolute -right-24 top-20 hidden w-80 opacity-10 lg:block"
        />

        <Container className="relative">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            {/* ---------- Изображения ---------- */}
            <ProductGallery
              photos={photos.map((p) => ({ id: p.id, url: p.imageUrl }))}
              logoUrl={logo?.imageUrl ?? null}
              alt={item.name}
            />

            {/* ---------- Описание и цена ---------- */}
            <div>
              {item.isPopular && (
                <TapeLabel variant="brand" size="sm" tilt="left" className="mb-4">
                  Популярное
                </TapeLabel>
              )}

              <p className="mt-5 font-mono text-3xl text-ink">
                <span className="text-base text-ink/45">от </span>
                {money.format(fromPrice)}
                <span className="text-base text-ink/45">
                  {" "}
                  / {item.unit ?? "шт."}
                </span>
              </p>

              {item.description && (
                <p className="mt-6 leading-relaxed text-ink/70">
                  {item.description}
                </p>
              )}

              {/* Параметры заказа */}
              <dl className="mt-8 grid gap-3 sm:grid-cols-2">
                <Spec icon={Package} label="Минимальный заказ">
                  {item.minQuantity} {item.unit ?? "шт."}
                </Spec>
                {item.multiplicity > 1 && (
                  <Spec icon={Layers} label="Кратность">
                    по {item.multiplicity} {item.unit ?? "шт."}
                  </Spec>
                )}
                {size && (
                  <Spec icon={Ruler} label="Размер изделия">
                    {size}
                  </Spec>
                )}
              </dl>

              <AddToCartForm
                productId={item.id}
                unit={item.unit ?? "шт."}
                basePrice={item.basePrice}
                tiers={tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: t.price }))}
                minQuantity={item.minQuantity}
                multiplicity={item.multiplicity}
                attributes={attributes}
              />

              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/cart" size="md" variant="outline">
                  Перейти в корзину
                </ButtonLink>
                <ButtonLink href="/requirements" size="md" variant="ghost">
                  Требования к макету
                </ButtonLink>
              </div>
            </div>
          </div>

          {/* ---------- Цены по тиражам (Карточка-лист) ---------- */}
          {tiers.length > 0 && (
            <div className="mt-14">
              <ClippedCard clipType="steel" clipPosition="top-left" paper="dark">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl text-bone">
                      Цена за тираж
                    </h2>
                    <p className="mt-1.5 text-sm text-ice/60">
                      Чем больше тираж, тем ниже цена за единицу.
                    </p>
                  </div>
                  <StampBadge variant="brand" className="text-brand-bright border-brand-bright/60 bg-brand-bright/10 text-[0.65rem]">
                    Тиражная сетка
                  </StampBadge>
                </div>

                <div className="relative mt-7 overflow-x-auto">
                  <table className="w-full min-w-[26rem] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-ice/15">
                        <th className="pb-3 font-display text-xs tracking-[0.16em] text-ice/45">
                          Количество
                        </th>
                        <th className="pb-3 text-right font-display text-xs tracking-[0.16em] text-ice/45">
                          Цена за {item.unit ?? "шт."}
                        </th>
                        <th className="pb-3 text-right font-display text-xs tracking-[0.16em] text-ice/45">
                          Стоимость тиража
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t) => {
                        const qty = t.maxQty ?? t.minQty;
                        return (
                          <tr
                            key={t.id}
                            className="border-b border-ice/8 last:border-0"
                          >
                            <td className="py-3 font-mono text-sm text-ice/80">
                              {t.minQty}
                              {t.maxQty ? `–${t.maxQty}` : " и больше"}
                            </td>
                            <td className="py-3 text-right font-mono text-brand-bright">
                              {money.format(Number(t.price))}
                            </td>
                            <td className="py-3 text-right font-mono text-sm text-ice/55 tabular-nums">
                              от {money.format(Number(t.price) * t.minQty)}
                              <span className="sr-only">
                                {" "}
                                за {qty} {item.unit ?? "шт."}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ClippedCard>
            </div>
          )}

          {/* ---------- Отзывы ---------- */}
          {(approved.length > 0 || canReview) && (
            <div className="mt-14">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-2xl text-navy">Отзывы</h2>
                <StampBadge variant="ok" className="text-[0.62rem]">
                  ОТК Контроль
                </StampBadge>
                {averageRating !== null && (
                  <span className="flex items-center gap-1.5 text-sm text-ink/60">
                    <Star className="size-4 fill-brand text-brand" aria-hidden />
                    {averageRating.toFixed(1)} из 5 · {approved.length}
                  </span>
                )}
              </div>

              {approved.length > 0 && (
                <ul className="mt-5 flex flex-col gap-3">
                  {approved.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-card border border-ink/10 bg-bone/85 p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-display text-ink">{r.name}</span>
                        <span className="flex gap-0.5" aria-label={`${r.rating} из 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={cn(
                                "size-3.5",
                                n <= Number(r.rating)
                                  ? "fill-brand text-brand"
                                  : "text-ink/15",
                              )}
                              aria-hidden
                            />
                          ))}
                        </span>
                        {r.createdAt && (
                          <span className="text-xs text-ink/40">
                            {reviewDate.format(r.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-ink/75">
                        {r.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {canReview && (
                <div className="mt-5">
                  <ReviewForm productId={productId} />
                </div>
              )}
            </div>
          )}

          <p className="mt-10">
            <Link
              href="/catalog"
              className="font-display text-sm tracking-wide text-brand hover:text-brand-bright"
            >
              ← Весь каталог
            </Link>
          </p>
        </Container>
      </section>
    </>
  );
}

function Spec({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-ink/10 bg-bone/70 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div>
        <dt className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
      </div>
    </div>
  );
}
