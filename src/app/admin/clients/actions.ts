"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { parseId } from "@/lib/ids";
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
 * Над кем можно совершить действие.
 *
 * Сейчас `users.manage` выдано только администратору, но матрица прав -
 * это данные, и право могут выдать менеджеру. Учётную запись
 * администратора он всё равно трогать не должен: заблокировав или сменив
 * ей доступ, он отрезал бы того, кто выдаёт права. Поэтому действия над
 * админом - только у админа (страница клиента прячет кнопки по тому же
 * правилу). Не экспортируется: из файла «use server» наружу
 * уходят одни действия, а эта проверка стала бы ещё одним эндпоинтом.
 */
async function loadTarget(id: number) {
  const me = await currentUser();
  if (!me) return { error: "Нет прав" } as const;

  const [target] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      chatId: users.telegramChatId,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!target) return { error: "Клиент не найден" } as const;

  if (target.role === "admin" && me.role !== "admin") {
    return { error: "Действия над администратором доступны только администратору" } as const;
  }

  return { me, target, self: Number(me.id) === target.id } as const;
}

/**
 * Блокировка клиента.
 *
 * Сессия отзывается сама: колбэк session сверяется с базой при каждом
 * чтении, поэтому заблокированного выкидывает на ближайшем же запросе,
 * а не через 30 дней, когда истечёт токен. Счётчик версии сессии растёт в
 * том же UPDATE: токен, выданный до блокировки, после разблокировки
 * оживать не должен.
 */
export async function setBlocked(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = parseId(formData.get("userId"));
  const blocked = formData.get("blocked") === "1";
  if (id === null) return;

  const t = await loadTarget(id);
  if ("error" in t) return;

  // Заблокировать самого себя - верный способ потерять доступ в админку
  if (t.self) return;

  await db
    .update(users)
    .set({
      isBlocked: blocked,
      ...(blocked ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
    })
    .where(eq(users.id, id));

  await audit(blocked ? "user.block" : "user.unblock", { type: "user", id }, { role: t.target.role });

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

/** Доступ к редактору открыток - точечно, отдельным клиентам. */
export async function setEditorAccess(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = parseId(formData.get("userId"));
  const allowed = formData.get("allowed") === "1";
  if (id === null) return;

  const t = await loadTarget(id);
  if ("error" in t) return;

  await db
    .update(users)
    .set({ canUseEditor: allowed })
    .where(eq(users.id, id));

  await audit("user.editor_access", { type: "user", id }, { allowed });

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

/** Мини-склад - тоже платная опция для отдельных клиентов. */
export async function setWarehouseAccess(formData: FormData) {
  if (!(await can("users", "manage"))) return;

  const id = parseId(formData.get("userId"));
  const allowed = formData.get("allowed") === "1";
  if (id === null) return;

  const t = await loadTarget(id);
  if ("error" in t) return;

  await db
    .update(users)
    .set({ miniWarehouseEnabled: allowed })
    .where(eq(users.id, id));

  await audit("user.warehouse_access", { type: "user", id }, { allowed });

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

  const id = parseId(formData.get("userId"));
  if (id === null) return { ok: false, message: "Клиент не найден" };

  const t = await loadTarget(id);
  if ("error" in t) return { ok: false, message: t.error };

  const client = t.target;
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

  // Сам токен в журнал не пишем - только факт и способ доставки
  await audit("user.reset_link", { type: "user", id }, { channel: sent });

  revalidatePath(`/admin/clients/${id}`);
  return { ok: true, message: `Ссылка отправлена ${sent}` };
}
