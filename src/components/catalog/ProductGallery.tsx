"use client";

import { useState } from "react";
import { ProductImage } from "@/components/catalog/ProductImage";
import { cn } from "@/lib/cn";

export type GalleryPhoto = { id: number; url: string };

/**
 * Галерея карточки товара: фотографии готовых работ.
 *
 * Превью переключают большой снимок - раньше они просто лежали под ним,
 * и нажатие ничего не делало.
 *
 * Пока фотографий нет, показываем логотип товара целиком, на светлой
 * подложке. Серая плашка со значком «нет картинки» на её месте
 * выглядела как поломка, а на телефоне ещё и отодвигала цену с кнопкой
 * «В корзину» на второй экран.
 */
export function ProductGallery({
  photos,
  logoUrl,
  alt,
}: {
  photos: GalleryPhoto[];
  logoUrl: string | null;
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (photos.length === 0) {
    if (!logoUrl) return null;
    return (
      <div className="relative aspect-4/3 overflow-hidden rounded-card border border-ink/10 bg-bone max-lg:aspect-video">
        <ProductImage
          src={logoUrl}
          alt={alt}
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain p-8 sm:p-12"
        />
      </div>
    );
  }

  const current = photos[Math.min(active, photos.length - 1)];

  return (
    <div>
      <div className="relative aspect-4/3 overflow-hidden rounded-card border border-ink/10 bg-ice">
        <ProductImage
          // Ключ пересоздаёт картинку при смене снимка: иначе запасная
          // заглушка от сломанного файла осталась бы и на рабочем
          key={current.id}
          src={current.url}
          alt={alt}
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>

      {photos.length > 1 && (
        <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Фото ${i + 1} из ${photos.length}`}
                aria-pressed={photo.id === current.id}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-xl border bg-ice transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-bright",
                  photo.id === current.id
                    ? "border-brand ring-2 ring-brand/40"
                    : "border-ink/10 opacity-80 hover:opacity-100",
                )}
              >
                <ProductImage src={photo.url} alt="" sizes="120px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
