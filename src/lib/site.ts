/** Контакты и реквизиты компании - перенесено из includes/footer.php. */
export const site = {
  name: "БЗК Принт",
  legalName: "БЗК Принт",
  phone: "+7 922 304-04-65",
  phoneHref: "tel:+79223040465",
  email: "bzkprint@yandex.ru",
  address: "г. Пермь, ул. Сухобруса 27, офис 101",
  mapUrl:
    "https://yandex.ru/maps/50/perm/?ll=56.181004%2C58.007673&mode=whatshere&whatshere%5Bpoint%5D=56.180496%2C58.007562&whatshere%5Bzoom%5D=16&z=17.44",
  hours: [
    { days: "Пн - Пт", time: "11:00 - 18:00" },
    { days: "Сб", time: "Выходной" },
    { days: "Вс", time: "Выходной" },
  ],
  social: [
    { label: "Telegram", href: "https://t.me/bzkprint" },
    { label: "ВКонтакте", href: "https://vk.com/bzkprint" },
  ],
} as const;

/**
 * Адрес сайта для карты сайта, robots и абсолютных ссылок в письмах.
 *
 * Берётся из окружения: на боевом это bzkprint.ru, в разработке -
 * localhost. Хвостовой слэш срезаем, иначе в ссылках появится двойной.
 */
export const siteUrl = (
  process.env.SITE_URL?.trim() ||
  process.env.AUTH_URL?.trim() ||
  "https://bzkprint.ru"
).replace(/\/+$/, "");

/** Абсолютная ссылка на страницу сайта. */
export function absoluteUrl(path: string) {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
