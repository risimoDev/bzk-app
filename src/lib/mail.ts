import "server-only";
import nodemailer from "nodemailer";

/**
 * Отправка почты.
 *
 * Пока единственное письмо - ссылка на смену пароля, но канал нужен
 * отдельный: телеграм привязан не у всех, а забыть пароль может каждый.
 *
 * Настроек нет - значит письма не уходят, и это не ошибка: на разработке
 * SMTP никто не поднимает. Вызывающий код по ответу видит, ушло письмо
 * или нет, и решает сам, что сказать человеку.
 */

const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT ?? 465);
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM?.trim() || "БЗК Принт <bzkprint@yandex.ru>";

export function isMailConfigured() {
  return Boolean(host && user && pass);
}

/**
 * Соединение создаём один раз и держим: nodemailer сам поднимает пул и
 * переподключается. Создавать транспорт на каждое письмо - лишнее
 * рукопожатие TLS на каждую отправку.
 */
let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (!isMailConfigured()) return null;
  transport ??= nodemailer.createTransport({
    host,
    port,
    // 465 - это SMTPS, там TLS с первого байта; на 587 шифрование
    // включается уже внутри сессии командой STARTTLS
    secure: port === 465,
    auth: { user, pass },
    pool: true,
  });
  return transport;
}

export type MailResult = { ok: boolean; error?: string };

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const t = getTransport();
  if (!t) return { ok: false, error: "Почта не настроена" };

  try {
    await t.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (error) {
    // Наружу текст ошибки не отдаём: в нём бывает адрес сервера и имя
    // пользователя SMTP. В журнал - целиком
    console.error("Не удалось отправить письмо:", error);
    return { ok: false, error: "Письмо не отправилось" };
  }
}

/** Экранирование для писем в HTML. */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
