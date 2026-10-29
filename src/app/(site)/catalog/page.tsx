import type { Metadata } from "next";
import { applySeo } from "@/lib/seo";
import { readSeo } from "@/lib/seo-db";
import Link from "next/link";
import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { catalogImages } from "@/lib/product-images-db";
import { catalogImageUrl } from "@/lib/product-images";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { Decor, scribble } from "@/components/ui/Collage";
import { ProductImage } from "@/components/catalog/ProductImage";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { TapeLabel } from "@/components/ui/TapeLabel";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";
import { catalogPricing } from "@/lib/catalog-price-db";
import { CatalogPrice } from "@/components/catalog/CatalogPrice";

/**
 * Заголовок и описание можно переопределить в админке: если для
 * страницы заведена запись в seo_settings, она накладывается поверх
 * значений ниже. Пустые поля записи ничего не затирают.
 */
const baseMetadata: Metadata = {
  title: "Каталог",
  description:
    "Визитки, листовки, буклеты, наклейки, сувенирная продукция и наружная реклама. Цены за тираж и расчёт под задачу.",
};

export async function generateMetadata(): Promise<Metadata> {
  return applySeo(baseMetadata, await readSeo("/catalog"), "/catalog");
}

/**
 * Цена показывается «от», потому что реальная зависит от тиража: это цена
 * за единицу при минимальном тираже (lib/product-price.ts), а не базовая.
 */
function formatPrice(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const n = value;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

async function getCatalog(categoryId?: number) {
  // Картинка товара - отдельной подзапросной колонкой, иначе на каждый
  // товар пришлось бы делать свой запрос. В сетке каталога показывается
  // логотип вида работы, фотографии готовых работ живут в карточке.
  const image = catalogImages();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      basePrice: products.basePrice,
      minQuantity: products.minQuantity,
      multiplicity: products.multiplicity,
      unit: products.unit,
      isPopular: products.isPopular,
      categoryId: products.categoryId,
      categoryName: categories.name,
      logoUrl: image.logoUrl,
      photoUrl: image.photoUrl,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(image, eq(image.productId, products.id))
    .where(
      categoryId
        ? and(eq(products.isHidden, false), eq(products.categoryId, categoryId))
        : eq(products.isHidden, false),
    )
    .orderBy(desc(products.isPopular), asc(products.name));

  return rows;
}

async function getCategories() {
  return db.select().from(categories).orderBy(asc(categories.name));
}

export default async function CatalogPage(props: PageProps<"/catalog">) {
  const params = await props.searchParams;
  const raw = Array.isArray(params.category) ? params.category[0] : params.category;
  // Негодная категория - не ошибка, а просто весь каталог: адрес мог
  // остаться от старого сайта или быть подобран руками
  const activeId = parseId(raw) ?? undefined;

  const [items, cats] = await Promise.all([getCatalog(activeId), getCategories()]);
  const { from: prices, tiers: tiersByProduct, surcharges } = await catalogPricing(items);
  const active = cats.find((c) => c.id === activeId);

  return (
    <>
      <PageHero
        eyebrow="Каталог"
        title={active ? active.name : "Что мы производим"}
        lead="Цены указаны за минимальный тираж. Чем больше тираж, тем ниже цена за единицу - точную стоимость посчитаем под вашу задачу."
        breadcrumb={
          active
            ? [
                { href: "/catalog", label: "Каталог" },
                { href: `/catalog?category=${active.id}`, label: active.name },
              ]
            : [{ href: "/catalog", label: "Каталог" }]
        }
      />

      <section className="relative overflow-hidden torn-2 pb-14 pt-24 paper-light sm:pb-20 sm:pt-28">
        <Decor
          asset={scribble.loopsBlack}
          className="absolute -right-28 top-16 hidden w-96 opacity-10 lg:block"
        />

        <Container className="relative">
          {cats.length > 0 && (
            <nav aria-label="Категории" className="mb-10 flex flex-wrap gap-2">
              <CategoryChip href="/catalog" active={!activeId}>
                Все
              </CategoryChip>
              {cats.map((c) => (
                <CategoryChip
                  key={c.id}
                  href={`/catalog?category=${c.id}`}
                  active={activeId === c.id}
                >
                  {c.name}
                </CategoryChip>
              ))}
            </nav>
          )}

          {items.length === 0 ? (
            <div className="rounded-card border border-ink/10 bg-bone/85 p-12 text-center">
              <h2 className="font-display text-2xl text-ink">
                В этой категории пока пусто
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-ink/60">
                Мы делаем больше, чем успели выложить в каталог. Опишите задачу -
                посчитаем и подберём исполнение.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/contacts" size="md">
                  Обсудить задачу
                </ButtonLink>
                {activeId && (
                  <ButtonLink href="/catalog" size="md" variant="outline">
                    Весь каталог
                  </ButtonLink>
                )}
              </div>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const price = formatPrice(prices.get(item.id));
                const tiers = tiersByProduct.get(item.id) ?? [];
                return (
                  <li
                    key={item.id}
                    className="group relative flex flex-col overflow-hidden rounded-card border border-ink/10 bg-bone/85 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-lift"
                  >
                    <FavoriteButton
                      productId={item.id}
                      className="absolute right-3 top-3 z-10"
                    />
                    <div className="relative aspect-4/3 overflow-hidden bg-ice">
                      <ProductImage
                        src={catalogImageUrl(item)}
                        alt=""
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="transition-transform duration-500 group-hover:scale-105"
                      />
                      {item.isPopular && (
                        <TapeLabel
                          variant="brand"
                          size="sm"
                          tilt="left"
                          className="pointer-events-none absolute left-3 top-3 z-10"
                        >
                          Популярное
                        </TapeLabel>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      {item.categoryName && (
                        <span className="font-display text-[0.68rem] tracking-[0.16em] text-ink/40">
                          {item.categoryName}
                        </span>
                      )}
                      <h2 className="mt-1.5 font-display text-lg leading-tight text-ink group-hover:text-brand">
                        {/* «Растянутая» ссылка: ::after накрывает всю карточку,
                            а кнопки тиража лежат над ней (z-10). Внутрь <a>
                            кнопку не вложить, и клик по ней не должен
                            открывать товар. */}
                        <Link
                          href={`/catalog/${item.id}`}
                          className="after:absolute after:inset-0 after:z-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-bright"
                        >
                          {item.name}
                        </Link>
                      </h2>
                      {item.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-ink/55">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-auto pt-4 font-mono text-lg text-ink">
                        {tiers.length > 0 ? (
                          <CatalogPrice
                            unit={item.unit ?? "шт."}
                            basePrice={item.basePrice}
                            tiers={tiers}
                            minQuantity={item.minQuantity}
                            multiplicity={item.multiplicity}
                            surcharge={surcharges.get(item.id) ?? 0}
                          />
                        ) : price ? (
                          <>
                            <span className="text-sm text-ink/45">от </span>
                            {price}
                            <span className="text-sm text-ink/45">
                              {" "}
                              / {item.unit ?? "шт."}
                            </span>
                          </>
                        ) : (
                          <span className="text-base text-ink/50">
                            Цена по запросу
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display text-xs tracking-wider transition-all select-none uppercase",
        active
          ? "tape-strip text-ink px-4 py-2 shadow-sm tape-tilt font-bold border-b border-[#d5cebe]"
          : "rounded-pill border border-ink/15 bg-bone/70 px-4 py-2 text-ink/65 hover:border-brand/50 hover:text-brand",
      )}
    >
      {children}
    </Link>
  );
}
