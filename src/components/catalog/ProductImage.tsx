"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Картинка товара с запасным вариантом.
 *
 * Часть путей в базе осталась от старого сайта и ведёт в его
 * /storage/uploads/, а эта папка не перенесена - файлов на месте нет.
 * Без обработки ошибки карточка показывала бы значок сломанного
 * изображения, вместо этого рисуем аккуратную заглушку. Она же
 * появляется у товара, которому картинку ещё не завели.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  className,
}: {
  src: string | null;
  alt: string;
  sizes?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <span
        className={cn("grid size-full place-items-center bg-ice text-ink/20", className)}
        aria-hidden
      >
        <ImageOff className="size-10" />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      // Оптимизатор Next не умеет читать файл, которого нет на диске,
      // и отдаёт 400 - ошибку ловим здесь и показываем заглушку
      onError={() => setBroken(true)}
      className={cn("object-cover", className)}
    />
  );
}
