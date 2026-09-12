import { site, absoluteUrl } from "@/lib/site";

/**
 * Разметка schema.org для поисковиков.
 *
 * Яндекс и Google по ней понимают, что это за организация, где она и
 * когда работает, а у товара - цену и оценки. Показывают это в выдаче
 * и на картах; без разметки приходится угадывать по тексту страницы.
 *
 * Чистые данные без React: сериализация отдельно, чтобы её можно было
 * проверить скриптом.
 */

/**
 * JSON для `<script type="application/ld+json">`.
 *
 * `<` экранируем: в названии товара или отзыве может оказаться
 * «</script>», и тогда браузер закрыл бы тег посреди данных.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Организация: для главной и контактов. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: site.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.png"),
    telephone: site.phone.replace(/[^\d+]/g, ""),
    email: site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "ул. Сухобруса, 27, офис 101",
      addressLocality: "Пермь",
      addressCountry: "RU",
    },
    // Часы - из того же справочника, что и подвал сайта: при смене
    // графика править одно место
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: site.hours[0].time.split("-")[0].trim(),
        closes: site.hours[0].time.split("-")[1].trim(),
      },
    ],
    sameAs: site.social.map((s) => s.href),
  };
}

/** Товар: цена «от и до» по ступеням тиража и оценка по отзывам. */
export function productJsonLd(input: {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: string;
  tierPrices: string[];
  rating: { value: number; count: number } | null;
}) {
  const prices = [input.basePrice, ...input.tierPrices]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: absoluteUrl(input.imageUrl) } : {}),
    url: absoluteUrl(`/catalog/${input.id}`),
    brand: { "@type": "Brand", name: site.name },
    ...(prices.length > 0
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "RUB",
            lowPrice: Math.min(...prices).toFixed(2),
            highPrice: Math.max(...prices).toFixed(2),
            offerCount: prices.length,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
    ...(input.rating && input.rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: input.rating.value.toFixed(1),
            reviewCount: input.rating.count,
          },
        }
      : {}),
  };
}
