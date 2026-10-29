import type { NextConfig } from "next";
import { legacyRedirects, legacyRewrites } from "./src/lib/redirects";

/**
 * Домен, с которого разрешено дёргать серверные действия.
 *
 * Next сверяет заголовок Origin запроса с Host и отклоняет несовпадения -
 * это встроенная защита от CSRF. За обратным прокси (Caddy) видимый Host
 * может отличаться от боевого домена, поэтому его перечисляем явно. Без
 * домена в окружении (в разработке) список пуст - тогда проверка идёт по
 * фактическому Host, как и задумано.
 */
const siteDomain = (process.env.SITE_DOMAIN || "").trim();
const allowedOrigins = siteDomain ? [siteDomain, `www.${siteDomain}`] : [];

const nextConfig: NextConfig = {
  // Самодостаточная сборка: в Docker-образ не нужен весь node_modules
  output: "standalone",

  // Заголовок X-Powered-By называет фреймворк и версию - подсказка тому,
  // кто подбирает известные дыры. Пользы от него никакой
  poweredByHeader: false,

  experimental: {
    serverActions: {
      // Серверные действия принимают только текст и админские картинки:
      // самая тяжёлая - фото брака до 8 МБ или пачка картинок товара до
      // 9 МБ вместе (MAX_QC_PHOTO_SIZE, MAX_PRODUCT_BATCH_SIZE), плюс
      // 10-20 КБ служебных байтов multipart. Макеты клиентов до 50 МБ идут
      // не сюда, а потоком в /api/client-uploads
      bodySizeLimit: "10mb",
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    },
    // Proxy (бывший middleware) буферизует тело запроса, чтобы прочитать
    // его и там, и в обработчике. Держим вровень с лимитом действий, чтобы
    // тело админской картинки не обрезалось раньше времени. Загрузка
    // макетов исключена из proxy (src/proxy.ts) и сюда не попадает
    proxyClientMaxBodySize: "10mb",
  },

  // В корне репозитория лежит package-lock.json старого PHP-сайта.
  // Без этого Turbopack принимает его за корень воркспейса.
  turbopack: { root: __dirname },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Адреса старого сайта. Список и объяснения - в src/lib/redirects.ts
  async redirects() {
    // /client без раздела раньше вёл в 404: корень кабинета - обзор
    return [
      ...legacyRedirects,
      { source: "/client", destination: "/client/dashboard", permanent: false },
    ];
  },

  async rewrites() {
    return legacyRewrites;
  },

  // Заголовки безопасности - перенос из .htaccess старого сайта
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // DENY, а не SAMEORIGIN - вровень с CSP `frame-ancestors 'none'`
          // из src/proxy.ts. Свои страницы мы во фреймы не вставляем, а
          // заголовок нужен старым браузерам, которые CSP не понимают.
          // HSTS ставит Caddy - здесь его не дублируем
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
