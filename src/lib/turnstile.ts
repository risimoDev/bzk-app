import "server-only";

/**
 * Проверка капчи Cloudflare Turnstile.
 *
 * Перенос из старого сайта (CaptchaService.php). Ставится на вход и
 * регистрацию: отбивает автоматический подбор и массовую регистрацию
 * ботами до того, как запрос дойдёт до проверки пароля.
 *
 * Если секрет не задан (в разработке ключей обычно нет) - капча
 * выключена, и проверка пропускает всех. Виджет при этом тоже не
 * показывается: клиентский код смотрит на публичный ключ.
 */

const SECRET = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured() {
  return SECRET !== "";
}

/**
 * Проверяет токен, который виджет положил в поле `cf-turnstile-response`.
 * Возвращает `true`, если капча пройдена или выключена.
 *
 * `remoteIp` передаём, если знаем: Cloudflare сверяет его с тем, откуда
 * решали капчу, - лишний рубеж против переиспользования чужого токена.
 */
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  if (!isTurnstileConfigured()) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret: SECRET, response: token });
  if (remoteIp && remoteIp !== "неизвестный-адрес") body.set("remoteip", remoteIp);

  try {
    // Ответ приходит быстро; таймаут на случай, если Cloudflare недоступен -
    // тогда честнее отказать, чем висеть на форме входа
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Сеть до Cloudflare не дошла: не пускаем, но и не роняем форму
    return false;
  }
}

export const TURNSTILE_FAILED_MESSAGE =
  "Не удалось проверить, что вы не робот. Обновите страницу и попробуйте ещё раз.";
