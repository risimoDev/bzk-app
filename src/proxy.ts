import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { parseId } from "@/lib/ids";

/**
 * Content-Security-Policy.
 *
 * На старом сайте политика стояла в .htaccess, при переносе потерялась -
 * в next.config.ts переехали только четыре заголовка из пяти. Это главная
 * защита от подстановки чужого скрипта: без неё любая дыра, через которую
 * на страницу попадает разметка, сразу становится исполнением кода.
 *
 * Скрипты разрешаем по одноразовому ключу (nonce). Next сам проставляет
 * его своим тегам, разобрав заголовок запроса, а `strict-dynamic` пускает
 * то, что эти скрипты подгружают дальше - без него сломалась бы догрузка
 * кусков приложения. Ключ обязан быть новым на каждый запрос, поэтому
 * страницы отдаются динамически; у нас они и так почти все динамические -
 * каждая ходит в базу.
 *
 * Стили - отдельная история. Nonce нельзя навесить на атрибут `style`, а
 * в разметке их два десятка (позиции блоков, ширина полос загрузки), плюс
 * <style> в печатных формах документов. Поэтому для стилей оставлено
 * 'unsafe-inline': подстановка стиля намного безобиднее подстановки кода,
 * а без этого послабления страницы просто развалились бы.
 */
function policy(nonce: string, dev: boolean) {
  const directives = [
    "default-src 'self'",
    // В разработке React пользуется eval, чтобы показывать серверные
    // стеки в браузере; в сборке ни React, ни Next этого не делают
    // challenges.cloudflare.com - скрипт капчи Turnstile на входе и
    // регистрации. При strict-dynamic перечислять его в script-src
    // необязательно (его подтянет наш же скрипт с nonce), но для самого
    // виджета нужен frame-src ниже
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // data: - иконки и шрифт открытки, blob: - предпросмотр картинки,
    // которую клиент только что выбрал в редакторе открыток
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Формы уходят только к нам: чужой адрес в action - это кража ввода
    "form-action 'self'",
    // Замена X-Frame-Options: сайт нельзя обернуть в чужой фрейм
    "frame-ancestors 'none'",
    // Чужие рамки: карта на «Контактах» и виджет капчи Turnstile.
    // Перечислены ровно их адреса, а не весь интернет
    "frame-src https://yandex.ru https://challenges.cloudflare.com",
    // Соединения только к себе плюс проверка капчи Turnstile
    dev
      ? "connect-src 'self' ws: wss: https://challenges.cloudflare.com"
      : "connect-src 'self' https://challenges.cloudflare.com",
  ];

  if (!dev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

/**
 * Есть ли открытый для витрины товар с таким адресом.
 *
 * Нужен для настоящего 404: у витрины есть loading.tsx, и к моменту, когда
 * страница товара понимает, что товара нет, ответ уже начат со статусом
 * 200. Сбой базы считаем «не знаю» и пропускаем запрос дальше - страница
 * разберётся сама.
 */
async function productMissing(pathname: string): Promise<boolean> {
  const match = /^\/catalog\/([^/]+)\/?$/.exec(pathname);
  if (!match) return false;

  let raw = match[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return true;
  }
  const id = parseId(raw);
  if (id === null) return true;

  try {
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), eq(products.isHidden, false)))
      .limit(1);
    return !row;
  } catch (e) {
    console.error("[proxy] не удалось проверить товар:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = policy(nonce, dev);

  // Заголовок кладём и в запрос - из него Next достаёт ключ при отрисовке,
  // и в ответ - по нему проверяет браузер
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Несуществующего пути нет, поэтому Next отвечает на него страницей
  // not-found с кодом 404; с адресом товара внутри она бы снова открыла
  // карточку
  const response = (await productMissing(request.nextUrl.pathname))
    ? NextResponse.rewrite(new URL("/__product-not-found", request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    /**
     * Всё, кроме статики и предзагрузки ссылок. Картинкам и файлам сборки
     * политика не нужна, а на предзагрузке next/link ключ только зря
     * ломал бы кеш ответов.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|logo.svg|bg/|collage/|editor/|production/|products/|video/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
