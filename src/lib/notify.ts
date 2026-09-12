import "server-only";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { users, notificationLog } from "@/db/schema";
import { sendMessage, esc, isTelegramConfigured, type InlineButton } from "@/lib/telegram";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { notificationHtml, notificationText } from "@/lib/notify-format";
import { absoluteUrl } from "@/lib/site";

/**
 * Отправка уведомлений.
 *
 * Клиенту - в телеграм и на почту, по тем галочкам, что стоят у него в
 * профиле. Почта появилась не ради рассылок: телеграм привязывают далеко
 * не все, и без второго канала клиент просто не узнавал, что заказ готов.
 *
 * Сотрудникам - только в телеграм: они в нём и работают, а письмо о
 * каждом новом заказе утонуло бы в ящике.
 *
 * Каждая попытка пишется в notification_log вместе с каналом, включая
 * неудачную: когда клиент говорит «мне ничего не приходило», по журналу
 * видно, что ушло, куда и что ответил сервер.
 */

type NotifyResult = { sent: number; failed: number };

async function logAttempt(input: {
  userId: number | null;
  eventCode: string;
  channel: "telegram" | "email";
  title: string;
  message: string;
  status: "sent" | "failed";
  error?: string;
}) {
  await db.insert(notificationLog).values({
    userId: input.userId,
    eventCode: input.eventCode,
    channel: input.channel,
    title: input.title,
    message: input.message,
    status: input.status,
    errorMessage: input.error ?? null,
  });
}

/**
 * Шлёт одному пользователю по всем каналам, которые он не отключил.
 *
 * Текст - в разметке телеграма; письмо собирается из него же, а кнопки
 * становятся ссылками. Так у двух каналов не бывает разных формулировок.
 */
export async function notifyUser(
  userId: number,
  eventCode: string,
  title: string,
  text: string,
  buttons?: InlineButton[][],
): Promise<NotifyResult> {
  const telegramOn = isTelegramConfigured();
  const mailOn = isMailConfigured();
  if (!telegramOn && !mailOn) return { sent: 0, failed: 0 };

  const [user] = await db
    .select({
      email: users.email,
      chatId: users.telegramChatId,
      telegramEnabled: users.telegramNotifications,
      emailEnabled: users.emailNotifications,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.isBlocked) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  if (telegramOn && user.chatId && user.telegramEnabled !== false) {
    const r = await sendMessage(user.chatId, text, buttons);
    await logAttempt({
      userId,
      eventCode,
      channel: "telegram",
      title,
      message: text,
      status: r.ok ? "sent" : "failed",
      error: r.error,
    });
    if (r.ok) sent++;
    else failed++;
  }

  // NULL в email_notifications - значит человек галочку не трогал, а по
  // умолчанию она включена
  if (mailOn && user.email && user.emailEnabled !== false) {
    const links = (buttons ?? []).flat().flatMap((b) => ("url" in b && b.url ? [{ text: b.text, url: b.url }] : []));
    const r = await sendMail({
      to: user.email,
      subject: `${title} · БЗК Принт`,
      text: notificationText(text, links),
      html: notificationHtml(text, links),
    });
    await logAttempt({
      userId,
      eventCode,
      channel: "email",
      title,
      message: notificationText(text, links),
      status: r.ok ? "sent" : "failed",
      error: r.error,
    });
    if (r.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

/** Шлёт всем сотрудникам, у которых привязан телеграм. */
export async function notifyStaff(
  eventCode: string,
  title: string,
  text: string,
  buttons?: InlineButton[][],
): Promise<NotifyResult> {
  if (!isTelegramConfigured()) return { sent: 0, failed: 0 };

  const staff = await db
    .select({ id: users.id, chatId: users.telegramChatId })
    .from(users)
    .where(
      and(
        inArray(users.role, ["admin", "manager"]),
        eq(users.telegramNotifications, true),
        eq(users.isBlocked, false),
      ),
    );

  let sent = 0;
  let failed = 0;

  for (const s of staff) {
    if (!s.chatId) continue;
    const r = await sendMessage(s.chatId, text, buttons);
    await logAttempt({
      userId: s.id,
      eventCode,
      channel: "telegram",
      title,
      message: text,
      status: r.ok ? "sent" : "failed",
      error: r.error,
    });
    if (r.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

// ------------------------------------------------- готовые события

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

/** Новый заказ с сайта - сотрудникам. */
export async function notifyNewOrder(input: {
  orderId: number;
  clientName: string;
  total: number;
  urgent: boolean;
}) {
  const text =
    `<b>Новый заказ с сайта № ${input.orderId}</b>\n` +
    `Клиент: ${esc(input.clientName)}\n` +
    `Сумма: ${esc(money.format(input.total))}` +
    (input.urgent ? `\n\n⚡ Срочный` : "");

  return notifyStaff("order_created", `Заказ № ${input.orderId}`, text, [
    [{ text: "Открыть заказ", url: absoluteUrl(`/admin/orders/${input.orderId}`) }],
  ]);
}

/** Смена стадии заказа - клиенту. */
export async function notifyOrderStatus(input: {
  userId: number;
  orderId: number;
  statusLabel: string;
}) {
  const text =
    `<b>Заказ № ${input.orderId}</b>\n` + `Новая стадия: ${esc(input.statusLabel)}`;

  return notifyUser(input.userId, "order_status_changed", `Заказ № ${input.orderId}`, text, [
    [{ text: "Открыть заказ", url: absoluteUrl(`/client/orders/${input.orderId}`) }],
  ]);
}

/** Сообщение по заказу - второй стороне. */
export async function notifyOrderMessage(input: {
  toUserId: number;
  orderId: number;
  authorName: string;
  preview: string;
}) {
  const text =
    `<b>Сообщение по заказу № ${input.orderId}</b>\n` +
    `${esc(input.authorName)}: ${esc(input.preview.slice(0, 300))}`;

  return notifyUser(input.toUserId, "order_message", `Заказ № ${input.orderId}`, text, [
    [{ text: "Ответить", url: absoluteUrl(`/client/orders/${input.orderId}`) }],
  ]);
}
