import type { MetadataRoute } from "next";

/**
 * Манифест сайта: название и значок, когда сайт добавляют на экран
 * телефона. Клиенты, которые следят за заказом, так и делают - и без
 * манифеста на экране оказывается безымянный снимок страницы.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "БЗК Принт - рекламно-производственное агентство",
    short_name: "БЗК Принт",
    description: "Печать, сувениры и наружная реклама в Перми. Заказы и их статус - в личном кабинете.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#0e1417",
    lang: "ru",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
