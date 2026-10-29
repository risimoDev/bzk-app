import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Телеграм-бот: отправка сообщений и привязка аккаунта.
 *
 * Перенесено из includes/telegram.php и telegram_webhook.php с одной
 * существенной переделкой - способом связать аккаунт с чатом. В старом
 * боте команда «/connect почта@клиента» привязывала чат к аккаунту по
 * одному только адресу: кто знал почту клиента, тот и получал его
 * уведомления о заказах. Здесь вместо адреса разовый код из кабинета -
 * он подтверждает, что человек владеет и аккаунтом, и чатом. Выдача и
 * погашение кодов - `telegram-link.ts` и `telegram-link-db.ts`.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID?.trim() ?? "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";

const API = "https://api.telegram.org";

export function isTelegramConfigured() {
  return TOKEN !== "";
}

export function hasGroupChat() {
  return GROUP_CHAT_ID !== "";
}

export function hasWebhookSecret() {
  return WEBHOOK_SECRET !== "";
}

/**
 * Сравнение секрета вебхука.
 *
 * Телеграм присылает его заголовком, если вебхук зарегистрирован с
 * secret_token. Сравниваем побайтно с постоянным временем: обычное
 * равенство строк отвечает тем быстрее, чем раньше расходятся байты, и
 * по времени ответа секрет подбирается посимвольно.
 */
export function checkWebhookSecret(received: string | null) {
  if (WEBHOOK_SECRET === "") return true;
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------- отправка

type SendResult = { ok: boolean; error?: string };

/** Экранирование для parse_mode=HTML: телеграм понимает эти четыре. */
export function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function callApi<T = unknown>(
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!isTelegramConfigured()) {
    return { ok: false, description: "Токен бота не задан" };
  }

  try {
    const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    return data;
  } catch (e) {
    return {
      ok: false,
      description: e instanceof Error ? e.message : "Телеграм не ответил",
    };
  }
}

/**
 * Ошибка телеграма, которая не пройдёт сама: бот заблокирован, чата нет,
 * аккаунт удалён. Повторять отправку бессмысленно - в отличие от сетевого
 * сбоя или «слишком часто». Сравнение по тексту описания, потому что
 * кроме него и кода 400/403 ничего различающего API не отдаёт.
 */
export function isPermanentTelegramError(error: string | undefined | null): boolean {
  if (!error) return false;
  return /bot was blocked|chat not found|user is deactivated|can't initiate conversation|bot was kicked|have no rights to send|peer_id_invalid|chat_id is empty|group chat was upgraded/i.test(
    error,
  );
}

export type InlineButton = { text: string; url?: string; callback_data?: string };

export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][],
): Promise<SendResult> {
  if (!chatId) return { ok: false, error: "Не указан чат" };

  const r = await callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    // Ссылки в наших сообщениях ведут в кабинет; разворачивать их
    // предпросмотром незачем - он занимает пол-экрана в телефоне
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });

  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

/**
 * Сообщение сотруднику и в рабочую группу.
 *
 * Группа настраивается отдельно: без неё уходит только личное сообщение,
 * и это не ошибка.
 */
export async function sendToUserAndGroup(
  chatId: string | number | null,
  text: string,
  buttons?: InlineButton[][],
) {
  const results: SendResult[] = [];
  if (chatId) results.push(await sendMessage(chatId, text, buttons));
  if (GROUP_CHAT_ID) results.push(await sendMessage(GROUP_CHAT_ID, text, buttons));
  return results;
}

// ------------------------------------------------------------ вебхук

export type WebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export async function getWebhookInfo() {
  const r = await callApi<WebhookInfo>("getWebhookInfo");
  return r.ok ? (r.result ?? null) : null;
}

export type BotInfo = { id: number; username?: string; first_name?: string };

export async function getBotInfo() {
  const r = await callApi<BotInfo>("getMe");
  return r.ok ? (r.result ?? null) : null;
}

export async function setWebhook(url: string) {
  const r = await callApi("setWebhook", {
    url,
    // Голосовые и стикеры боту не нужны - экономим и трафик, и разбор
    allowed_updates: ["message", "callback_query"],
    ...(WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {}),
    drop_pending_updates: true,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

export async function deleteWebhook() {
  const r = await callApi("deleteWebhook", { drop_pending_updates: true });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}
