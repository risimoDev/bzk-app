import "server-only";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { users, notificationLog } from "@/db/schema";
import { sendMessage, esc, isTelegramConfigured, type InlineButton } from "@/lib/telegram";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { notificationHtml, notificationText } from "@/lib/notify-format";
import { absoluteUrl } from "@/lib/site";
import { afterResponse } from "@/lib/notify-after";
import { EVENTS } from "@/lib/notify-events";

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
 *
 * Два слоя. `deliver*` отправляют и возвращают итог - их зовёт
 * планировщик, которому важно знать, дошло ли. `notify*` откладывают
 * отправку на после ответа (`afterResponse`) и ничего не возвращают: из
 * действий и маршрутов их зовут, чтобы человек не ждал Telegram и SMTP.
 * Каналы идут параллельно и независимо: упавшая почта не отменяет
 * телеграм, а сбой записи в журнал не отменяет отправку.
 */

type NotifyResult = { sent: number; failed: number };

type Channel = "telegram" | "email";

type Attempt = { ok: boolean; error?: string };

type LogInput = {
  userId: number | null;
  eventCode: string;
  channel: Channel;
  title: string;
  message: string;
};

/** Запись в журнал не должна ронять отправку: письмо уже ушло или нет, это важнее. */
async function logAttempt(input: LogInput, result: Attempt) {
  try {
    await db.insert(notificationLog).values({
      userId: input.userId,
      eventCode: input.eventCode,
      channel: input.channel,
      title: input.title,
      message: input.message,
      status: result.ok ? "sent" : "failed",
      errorMessage: result.error ?? null,
    });
  } catch (e) {
    console.error("[notify] журнал не записан:", e instanceof Error ? e.message : e);
  }
}

/** Одна отправка с записью в журнал. Исключение превращается в неудачу, а не вылетает. */
async function attempt(input: LogInput, send: () => Promise<Attempt>): Promise<Attempt> {
  let result: Attempt;
  try {
    result = await send();
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await logAttempt(input, result);
  return result;
}

/** Сводка по параллельным отправкам: отклонённое обещание считается неудачей. */
function tally(settled: PromiseSettledResult<Attempt>[]): NotifyResult {
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

export type NotifyOptions = {
  /** Только телеграм - для сотрудников, которым письмо о каждой мелочи ни к чему. */
  telegramOnly?: boolean;
};

/**
 * Шлёт одному пользователю по всем каналам, которые он не отключил.
 *
 * Текст - в разметке телеграма; письмо собирается из него же, а кнопки
 * становятся ссылками. Так у двух каналов не бывает разных формулировок.
 */
export async function deliverUser(
  userId: number,
  eventCode: string,
  title: string,
  text: string,
  buttons?: InlineButton[][],
  options: NotifyOptions = {},
): Promise<NotifyResult> {
  const telegramOn = isTelegramConfigured();
  const mailOn = isMailConfigured() && !options.telegramOnly;
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

  const jobs: Promise<Attempt>[] = [];

  if (telegramOn && user.chatId && user.telegramEnabled !== false) {
    const chatId = user.chatId;
    jobs.push(
      attempt({ userId, eventCode, channel: "telegram", title, message: text }, async () => {
        const r = await sendMessage(chatId, text, buttons);
        return { ok: r.ok, error: r.error };
      }),
    );
  }

  // NULL в email_notifications - значит человек галочку не трогал, а по
  // умолчанию она включена
  if (mailOn && user.email && user.emailEnabled !== false) {
    const to = user.email;
    const links = (buttons ?? []).flat().flatMap((b) => ("url" in b && b.url ? [{ text: b.text, url: b.url }] : []));
    const plain = notificationText(text, links);
    jobs.push(
      attempt({ userId, eventCode, channel: "email", title, message: plain }, async () => {
        const r = await sendMail({
          to,
          subject: `${title} · БЗК Принт`,
          text: plain,
          html: notificationHtml(text, links),
        });
        return { ok: r.ok, error: r.error };
      }),
    );
  }

  return tally(await Promise.allSettled(jobs));
}

/** Шлёт всем сотрудникам, у которых привязан телеграм. */
export async function deliverStaff(
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

  const jobs = staff.flatMap((s) => {
    const chatId = s.chatId;
    if (!chatId) return [];
    return [
      attempt({ userId: s.id, eventCode, channel: "telegram", title, message: text }, async () => {
        const r = await sendMessage(chatId, text, buttons);
        return { ok: r.ok, error: r.error };
      }),
    ];
  });

  return tally(await Promise.allSettled(jobs));
}

/** Клиенту или сотруднику - после ответа, ошибки в лог. */
export async function notifyUser(
  userId: number,
  eventCode: string,
  title: string,
  text: string,
  buttons?: InlineButton[][],
  options?: NotifyOptions,
): Promise<void> {
  afterResponse(`notify:${eventCode}`, () => deliverUser(userId, eventCode, title, text, buttons, options));
}

/** Всем сотрудникам с телеграмом - после ответа, ошибки в лог. */
export async function notifyStaff(
  eventCode: string,
  title: string,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  afterResponse(`notify:${eventCode}`, () => deliverStaff(eventCode, title, text, buttons));
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
  /** Пояснение под стадией - например, что заказ можно забирать. */
  note?: string;
}) {
  const text =
    `<b>Заказ № ${input.orderId}</b>\n` +
    `Новая стадия: ${esc(input.statusLabel)}` +
    (input.note ? `\n${esc(input.note)}` : "");

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

/** Новое обращение в поддержку - сотрудникам. */
export async function notifyNewTicket(input: {
  ticketId: number;
  number: string;
  subject: string;
  clientName: string;
  categoryLabel: string;
  priorityLabel: string;
  preview: string;
}) {
  const text =
    `<b>Новое обращение ${esc(input.number)}</b>\n` +
    `Клиент: ${esc(input.clientName)}\n` +
    `Тема: ${esc(input.subject)}\n` +
    `${esc(input.categoryLabel)} · приоритет: ${esc(input.priorityLabel.toLowerCase())}\n\n` +
    esc(input.preview.slice(0, 300));

  return notifyStaff(EVENTS.ticketNew, `Обращение ${input.number}`, text, [
    [{ text: "Открыть обращение", url: absoluteUrl(`/admin/support/${input.ticketId}`) }],
  ]);
}

/** Клиент дописал в открытое обращение - сотрудникам. */
export async function notifyTicketReply(input: {
  ticketId: number;
  number: string;
  clientName: string;
  preview: string;
}) {
  const text =
    `<b>Ответ в обращении ${esc(input.number)}</b>\n` +
    `${esc(input.clientName)}: ${esc(input.preview.slice(0, 300))}`;

  return notifyStaff(EVENTS.ticketReply, `Обращение ${input.number}`, text, [
    [{ text: "Открыть обращение", url: absoluteUrl(`/admin/support/${input.ticketId}`) }],
  ]);
}

/**
 * Клиент загрузил макет - сотрудникам.
 *
 * Файл, привязанный к заказу, виден на странице заказа; загруженный сам по
 * себе - только в карточке клиента, туда и ведёт кнопка.
 */
export async function notifyClientUpload(input: {
  userId: number;
  clientName: string;
  fileName: string;
  orderId: number | null;
}) {
  const text =
    `<b>Клиент загрузил макет</b>\n` +
    `Клиент: ${esc(input.clientName)}\n` +
    `Файл: ${esc(input.fileName)}` +
    (input.orderId ? `\nЗаказ № ${input.orderId}` : "");

  const url = input.orderId
    ? absoluteUrl(`/admin/orders/${input.orderId}`)
    : absoluteUrl(`/admin/clients/${input.userId}`);

  return notifyStaff(EVENTS.clientUpload, input.orderId ? `Заказ № ${input.orderId}` : "Новый макет", text, [
    [{ text: input.orderId ? "Открыть заказ" : "Открыть клиента", url }],
  ]);
}

/** Новый отзыв ждёт модерации - сотрудникам. */
export async function notifyNewReview(input: {
  productName: string;
  clientName: string;
  rating: number;
  preview: string;
}) {
  const text =
    `<b>Новый отзыв на модерации</b>\n` +
    `Товар: ${esc(input.productName)}\n` +
    `${esc(input.clientName)} · оценка ${input.rating} из 5\n\n` +
    esc(input.preview.slice(0, 300));

  return notifyStaff(EVENTS.reviewNew, "Новый отзыв", text, [
    [{ text: "Открыть очередь", url: absoluteUrl("/admin/inbox") }],
  ]);
}
