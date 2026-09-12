/**
 * Картинки товара: логотип для каталога и фотографии готовых работ.
 *
 * Заказчик разделил две роли намеренно. В каталоге на сетке нужен
 * узнаваемый значок вида работы - одинаковый по кадру и фону, иначе
 * плитка рассыпается. В карточке товара, наоборот, интересны примеры
 * готовых работ, и логотипу там места нет.
 *
 * Здесь только константы и разбор имён: файл подключают клиентские
 * компоненты форм, поэтому ни базы, ни диска тут быть не должно -
 * запись лежит в lib/uploads.ts, выдача в /api/product-image.
 */

export const PRODUCT_IMAGE_KINDS = {
  logo: {
    label: "Логотип",
    hint: "Показывается в каталоге и в избранном. Один на товар - новый заменяет прежний.",
  },
  photo: {
    label: "Фото работы",
    hint: "Показывается только в карточке товара. Главное фото открывает галерею.",
  },
} as const;

export type ProductImageKind = keyof typeof PRODUCT_IMAGE_KINDS;

export function isProductImageKind(value: unknown): value is ProductImageKind {
  return value === "logo" || value === "photo";
}

/**
 * Форматы. SVG не принимаем: его отдаёт наш же домен, а внутри может
 * лежать скрипт - за логотип это слишком дорогая плата.
 */
export const PRODUCT_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Потолок: витрине хватает картинки в тысячу-другую точек по стороне. */
export const MAX_PRODUCT_IMAGE_SIZE = 8 * 1024 * 1024;

/** Адрес выдачи. Файлы лежат в хранилище, а не в public - см. lib/uploads.ts. */
export const PRODUCT_IMAGE_ROUTE = "/api/product-image/";

/** Имя на диске: случайные шестнадцатеричные цифры и разрешённое расширение. */
export const PRODUCT_IMAGE_NAME = /^[0-9a-f]{32}\.(jpg|jpeg|png|webp)$/;

export function productImageUrl(filename: string) {
  return `${PRODUCT_IMAGE_ROUTE}${filename}`;
}

/**
 * Обратный разбор: из адреса в базе - имя файла на диске.
 *
 * `null` означает «файл не наш»: в `product_images` остались строки,
 * перенесённые со старого сайта, они ведут в `/storage/uploads/…`, и той
 * папки у нас нет. Удалять такую запись можно, а трогать диск по ней -
 * нельзя.
 */
export function productImageFilename(url: string | null): string | null {
  if (!url || !url.startsWith(PRODUCT_IMAGE_ROUTE)) return null;
  const name = url.slice(PRODUCT_IMAGE_ROUTE.length);
  return PRODUCT_IMAGE_NAME.test(name) ? name : null;
}

/**
 * Что показать в каталоге.
 *
 * По договорённости это логотип. Но пока логотип для товара не
 * нарисован, пустая плитка в сетке выглядит хуже, чем фотография, -
 * поэтому подставляется главное фото.
 */
export function catalogImageUrl(row: {
  logoUrl: string | null;
  photoUrl: string | null;
}) {
  return row.logoUrl ?? row.photoUrl;
}
