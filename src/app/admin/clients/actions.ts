"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can } from "@/lib/permissions";
import { currentUser } from "@/auth";
import { sendMail, isMailConfigured, escapeHtml } from "@/lib/mail";
import { sendMessage, esc, isTelegramConfigured } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import {
  issueResetToken,
  clearResetToken,
  RESET_TTL_MINUTES,
} from "@/lib/password-reset";

export type ClientActionState = { ok: boolean; message?: string };

/**
 * Блокировка клиента.
 *
 * Сессия отзывается сама: колбэк session сверяется с базой при каждом
 * чтении, поэтому заблокированного выкидывает на ближайшем же запросе,
 * а не через 30 дней, когда истечёт токен.
 */
export async function setBlocked(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = Number(formData.get("userId"));
  const blocked = formData.get("blocked") === "1";
  if (!Number.isInteger(id) || id <= 0) return;

  // Заблокировать самого себя - верный способ потерять доступ в админку
  const me = await currentUser();
  if (me && Number(me.id) === id) return;

  await db.update(users).set({ isBlocked: blocked }).where(eq(users.id, id));

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

/** Доступ к редактору открыток - точечно, отдельным клиентам. */
export async function setEditorAccess(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = Number(formData.get("userId"));
  const allowed = formData.get("allowed") === "1";
  if (!Number.isInteger(id) || id <= 0) return;

  await db
    .update(users)
    .set({ canUseEditor: allowed })
    .where(eq(users.id, id));

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

/** Мини-склад - тоже платная опция для отдельных клиентов. */
export async function setWarehouseAccess(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = Number(formData.get("userId"));
  const allowed = formData.get("allowed") === "1";
  if (!Number.isInteger(id) || id <= 0) return;

  await db
    .update(users)
    .set({ miniWarehouseEnabled: allowed })
    .where(eq(users.id, id));

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

/**
 * Отправить клиенту ссылку на смену пароля.
 *
 * Пароль менеджер не задаёт и не узнаёт: он только запускает ту же
 * процедуру, что и кнопка «забыли пароль». Иначе временный пароль
 * пришлось бы диктовать по телефону, и он расходился бы по переписке.
 */
export async function sendResetLink(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  if (!(await can("users", "manage"))) {
    return { ok: false, message: "Нет прав" };
  }

  const id = Number(formData.get("userId"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Клиент не найден" };

  const [client] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      chatId: users.telegramChatId,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!client) return { ok: false, message: "Клиент не найден" };
  if (client.isBlocked) {
    return { ok: false, message: "Клиент заблокирован - сначала разблокируйте" };
  }

  const token = await issueResetToken(client.id);
  const link = absoluteUrl(`/reset-password?token=${token}`);

  let sent: string | null = null;

  if (client.chatId && isTelegramConfigured()) {
    const r = await sendMessage(
      client.chatId,
      `<b>Смена пароля</b>\n${esc(client.name)}, ссылка живёт ${RESET_TTL_MINUTES / 60} часа:\n${esc(link)}`,
    );
    if (r.ok) sent = "в телеграм";
  }

  if (!sent && isMailConfigured()) {
    const r = await sendMail({
      to: client.email,
      subject: "Смена пароля - БЗК Принт",
      text: `${client.name}, ссылка для смены пароля:\n\n${link}\n\nОна действует ${RESET_TTL_MINUTES / 60} часа.`,
      html:
        `<p>${escapeHtml(client.name)}, ссылка для смены пароля:</p>` +
        `<p><a href="${escapeHtml(link)}">Задать новый пароль</a></p>` +
        `<p>Она действует ${RESET_TTL_MINUTES / 60} часа.</p>`,
    });
    if (r.ok) sent = "на почту";
  }

  if (!sent) {
    await clearResetToken(client.id);
    return {
      ok: false,
      message: "Отправить не удалось: телеграм не привязан, почта не настроена",
    };
  }

  revalidatePath(`/admin/clients/${id}`);
  return { ok: true, message: `Ссылка отправлена ${sent}` };
}
