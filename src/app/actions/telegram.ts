"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import {
  setWebhook,
  deleteWebhook,
  sendMessage,
  isTelegramConfigured,
} from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import { formatLinkCode } from "@/lib/telegram-link";
import { issueLinkCode } from "@/lib/telegram-link-db";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";

export type TelegramState = { ok: boolean; message?: string };

export type LinkCodeState = { code?: string; error?: string };

const WEBHOOK_PATH = "/api/telegram/webhook";

async function mayManage() {
  return can("settings", "edit");
}

/**
 * Регистрация вебхука.
 *
 * Адрес не даём вводить руками: телеграм должен стучаться ровно в наш
 * маршрут, а опечатка в адресе тихо отключила бы бота.
 */
export async function registerWebhook(
  _prev: TelegramState,
  _formData: FormData,
): Promise<TelegramState> {
  void _prev;
  void _formData;

  if (!(await mayManage())) return { ok: false, message: "Нужны права администратора" };
  if (!isTelegramConfigured()) {
    return { ok: false, message: "Не задан TELEGRAM_BOT_TOKEN" };
  }

  const url = absoluteUrl(WEBHOOK_PATH);

  // Телеграм ходит только по https и только на публичный адрес: с
  // localhost вебхук не поставить, и лучше сказать об этом сразу
  if (!url.startsWith("https://")) {
    return {
      ok: false,
      message: `Телеграм принимает только https. Сейчас SITE_URL = ${absoluteUrl("/")}`,
    };
  }

  const r = await setWebhook(url);
  revalidatePath("/admin/telegram");

  return r.ok
    ? { ok: true, message: `Вебхук зарегистрирован: ${url}` }
    : { ok: false, message: r.error ?? "Телеграм отказал" };
}

export async function removeWebhook(
  _prev: TelegramState,
  _formData: FormData,
): Promise<TelegramState> {
  void _prev;
  void _formData;

  if (!(await mayManage())) return { ok: false, message: "Нужны права администратора" };

  const r = await deleteWebhook();
  revalidatePath("/admin/telegram");

  return r.ok
    ? { ok: true, message: "Вебхук снят - бот больше не получает сообщения" }
    : { ok: false, message: r.error ?? "Телеграм отказал" };
}

/** Пробное сообщение себе - проверить, что бот вообще пишет. */
export async function sendTestMessage(
  _prev: TelegramState,
  _formData: FormData,
): Promise<TelegramState> {
  void _prev;
  void _formData;

  const user = await currentUser();
  if (!user || !(await mayManage())) {
    return { ok: false, message: "Нужны права администратора" };
  }

  const [row] = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, Number(user.id)))
    .limit(1);

  if (!row?.chatId) {
    return {
      ok: false,
      message: "Ваш аккаунт не связан с телеграмом - возьмите код в профиле кабинета",
    };
  }

  const r = await sendMessage(
    row.chatId,
    "Проверка связи. Если это сообщение пришло - бот настроен и пишет.",
  );

  return r.ok
    ? { ok: true, message: "Отправлено - проверьте чат с ботом" }
    : { ok: false, message: r.error ?? "Не отправилось" };
}

/** Отвязать чужой аккаунт от телеграма - например, при увольнении. */
export async function unlinkTelegram(
  _prev: TelegramState,
  formData: FormData,
): Promise<TelegramState> {
  if (!(await mayManage())) return { ok: false, message: "Нужны права администратора" };

  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return { ok: false, message: "Пользователь не найден" };

  const updated = await db
    .update(users)
    .set({ telegramChatId: null, telegramNotifications: false })
    .where(eq(users.id, userId))
    .returning({ name: users.name });

  if (updated.length === 0) return { ok: false, message: "Пользователь не найден" };

  revalidatePath("/admin/telegram");
  return { ok: true, message: `${updated[0].name} отвязан` };
}

/**
 * Код привязки телеграма для текущего пользователя. Выдаётся по кнопке:
 * код одноразовый и хранится в базе (отпечатком), его нельзя создавать при
 * каждом показе страницы. Нового можно просить не чаще пяти раз за 15
 * минут, а прежний при этом гаснет.
 */
export async function issueTelegramLinkCode(
  _prev: LinkCodeState,
): Promise<LinkCodeState> {
  void _prev;

  const me = await currentUser();
  if (!me) return { error: "Нужно войти" };
  if (!isTelegramConfigured()) return { error: "Телеграм не настроен" };

  const userId = Number(me.id);

  const [row] = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.chatId) {
    return { error: "Телеграм уже привязан - сначала отправьте боту /disconnect" };
  }

  const limit = await checkRateLimit(`tgissue:${userId}`, "telegramLinkIssue");
  if (!limit.ok) {
    return { error: `Слишком много кодов. Попробуйте ${retryAfterText(limit.retryAfter)}` };
  }
  await recordAttempt(`tgissue:${userId}`, "telegramLinkIssue");

  return { code: formatLinkCode(await issueLinkCode(userId)) };
}
