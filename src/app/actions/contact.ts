"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";
import { notifyStaff } from "@/lib/notify";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import { PREFERRED_CONTACT, type PreferredContact } from "@/lib/contact";
import { isKeyOf } from "@/lib/guards";
import { rejectOverlong } from "@/lib/text-limits";

export type ContactState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function sendContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  /**
   * Ловушка для роботов: поле спрятано от людей, и заполняет его только
   * тот, кто заполняет всё подряд. Отвечаем как на успех - иначе бот
   * поймёт, что попался, и в следующий раз обойдёт ловушку.
   *
   * Это не замена капче: на старом сайте стоял Turnstile от Cloudflare.
   * Вернуть его можно в любой момент, но для этого нужны ключи и запись
   * в политике безопасности - а ловушка с ограничением частоты работает
   * уже сейчас и ничего не просит у посетителя.
   */
  if (String(formData.get("company") ?? "") !== "") {
    return { ok: true };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 255);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 255);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 50);
  const message = String(formData.get("message") ?? "").trim();
  const agreement = formData.get("agreement") === "on";

  const rawContact = String(formData.get("preferredContact") ?? "email");
  const preferredContact = (
    isKeyOf(PREFERRED_CONTACT, rawContact) ? rawContact : "email"
  ) as PreferredContact;

  const fieldErrors: Record<string, string> = {};
  if (name === "") fieldErrors.name = "Как к вам обращаться?";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Проверьте адрес почты";
  if (message === "") fieldErrors.message = "Опишите задачу";
  if (message.length > 5000) fieldErrors.message = "Слишком длинное сообщение";
  if (!agreement) fieldErrors.agreement = "Без согласия отправить не получится";

  // Способ связи, для которого нужен телефон, без телефона бессмыслен
  if (preferredContact !== "email" && phone === "") {
    fieldErrors.phone = "Для такой связи нужен телефон";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Ограничение после разбора формы: опечатка не должна съедать попытку
  const ip = await clientIp();
  const limit = await checkRateLimit(ip, "contact");
  if (!limit.ok) {
    return {
      error: `Вы уже отправили несколько сообщений. Следующее можно ${retryAfterText(limit.retryAfter)}`,
    };
  }
  await recordAttempt(ip, "contact");

  const [saved] = await db
    .insert(contactMessages)
    .values({
      name,
      email,
      phone: phone || null,
      preferredContact,
      message,
      agreement: true,
      status: "new",
    })
    .returning({ id: contactMessages.id });

  // Сообщение бесполезно, если о нём никто не узнал: старый сайт слал
  // письмо через mail(), мы пишем в телеграм - там его увидят сразу
  await notifyStaff(
    "contact_message",
    "Сообщение с сайта",
    `<b>Сообщение с сайта</b>\n` +
      `${esc(name)} · ${esc(email)}` +
      (phone ? ` · ${esc(phone)}` : "") +
      `\nСвязь: ${esc(PREFERRED_CONTACT[preferredContact])}\n\n` +
      esc(message.slice(0, 500)),
    [[{ text: "Открыть", url: absoluteUrl("/admin/inbox") }]],
  );

  revalidatePath("/admin/inbox");

  return { ok: Boolean(saved) };
}
