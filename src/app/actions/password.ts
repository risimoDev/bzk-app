"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, recordAttempt, clearAttempts, retryAfterText } from "@/lib/rate-limit";
import { bumpSessionVersion } from "@/lib/sessions-db";
import { checkPassword } from "@/lib/password-policy";
import { sendMail, isMailConfigured, escapeHtml } from "@/lib/mail";
import { sendMessage, esc, isTelegramConfigured } from "@/lib/telegram";
import { absoluteUrl, site } from "@/lib/site";
import {
  issueResetToken,
  findByResetToken,
  clearResetToken,
  RESET_TTL_MINUTES,
} from "@/lib/password-reset";

export type PasswordState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Общие требования к новому паролю - те же, что при регистрации. */
function checkNewPassword(password: string, confirm: string) {
  const problem = checkPassword(password);
  if (problem) return problem;
  if (password !== confirm) return "Пароли не совпадают";
  return null;
}

// ------------------------------------------------- запрос ссылки

/**
 * Ответ одинаков независимо от того, есть такой адрес или нет: иначе по
 * форме восстановления можно перебрать, кто зарегистрирован на сайте.
 */
const SENT_ANYWAY =
  "Если такой адрес зарегистрирован, ссылка для смены пароля отправлена. Проверьте почту, в том числе папку «Спам».";

export async function requestPasswordReset(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 255);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { fieldErrors: { email: "Проверьте адрес почты" } };
  }

  const ip = await clientIp();
  const byIp = await checkRateLimit(ip, "passwordReset");
  const byEmail = await checkRateLimit(email, "passwordReset");

  if (!byIp.ok || !byEmail.ok) {
    const wait = Math.max(byIp.retryAfter, byEmail.retryAfter);
    return { error: `Слишком много запросов. Попробуйте ${retryAfterText(wait)}` };
  }

  await recordAttempt(ip, "passwordReset");
  await recordAttempt(email, "passwordReset");

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      chatId: users.telegramChatId,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.isBlocked) return { ok: true, message: SENT_ANYWAY };

  const token = await issueResetToken(user.id);
  const link = absoluteUrl(`/reset-password?token=${token}`);

  // Телеграм первым - как на старом сайте: доходит мгновенно и не тонет
  // в спаме. Почта остаётся запасным путём
  let delivered = false;

  if (user.chatId && isTelegramConfigured()) {
    const r = await sendMessage(
      user.chatId,
      `<b>Смена пароля</b>\n${esc(user.name)}, ссылка живёт ${RESET_TTL_MINUTES / 60} часа:\n` +
        `${esc(link)}\n\nЕсли пароль вы не меняли - просто не переходите по ней.`,
    );
    delivered = r.ok;
  }

  if (!delivered && isMailConfigured()) {
    const r = await sendMail({
      to: user.email,
      subject: "Смена пароля - БЗК Принт",
      text:
        `${user.name}, вы запросили смену пароля на ${site.name}.\n\n` +
        `${link}\n\nСсылка действует ${RESET_TTL_MINUTES / 60} часа. ` +
        `Если вы ничего не запрашивали, просто не переходите по ней.`,
      html:
        `<p>${escapeHtml(user.name)}, вы запросили смену пароля на ${escapeHtml(site.name)}.</p>` +
        `<p><a href="${escapeHtml(link)}">Задать новый пароль</a></p>` +
        `<p>Ссылка действует ${RESET_TTL_MINUTES / 60} часа. Если вы ничего не запрашивали, просто не переходите по ней.</p>`,
    });
    delivered = r.ok;
  }

  if (!delivered) {
    // Токен уже выдан, а доставить не смогли - гасим, иначе он будет
    // болтаться живым два часа впустую
    await clearResetToken(user.id);
    return {
      error: `Не получилось отправить ссылку. Позвоните нам: ${site.phone}`,
    };
  }

  return { ok: true, message: SENT_ANYWAY };
}

// ------------------------------------------------- смена по ссылке

export async function resetPassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");

  const problem = checkNewPassword(password, confirm);
  if (problem) return { fieldErrors: { password: problem } };

  const target = await findByResetToken(token);
  if (!target) {
    return {
      error: "Ссылка не подошла или устарела. Запросите новую на странице восстановления.",
    };
  }

  const hash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        password: hash,
        resetToken: null,
        resetTokenExpires: null,
        passwordChangedAt: new Date(),
        // Сброс пароля - обычно «меня взломали»: старые сессии должны умереть
        sessionVersion: bumpSessionVersion,
      })
      .where(eq(users.id, target.id));
  });

  return { ok: true, message: "Пароль изменён. Теперь войдите с новым паролем." };
}

// ------------------------------------------------- смена в кабинете

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await currentUser();
  if (!user) return { error: "Нужно войти" };

  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");

  if (current === "") {
    return { fieldErrors: { currentPassword: "Введите текущий пароль" } };
  }

  const problem = checkNewPassword(password, confirm);
  if (problem) return { fieldErrors: { password: problem } };

  // Лимит - до bcrypt: проверка пароля дорогая, и подбор через эту форму
  // иначе упирался бы в лимит уже после того, как сделал всю работу.
  // Ключ свой, не от входа: попытки здесь не должны запирать вход
  const reauthKey = `reauth:${user.id}`;
  const limit = await checkRateLimit(reauthKey, "reauth");
  if (!limit.ok) {
    return { error: `Слишком много попыток. Попробуйте ${retryAfterText(limit.retryAfter)}` };
  }

  const [row] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, Number(user.id)))
    .limit(1);

  if (!row) return { error: "Аккаунт не найден" };

  /**
   * Текущий пароль спрашиваем не ради формальности: сессия живёт тридцать
   * дней, и с чужого незакрытого браузера иначе можно было бы сменить
   * пароль и забрать аккаунт целиком.
   */
  if (!(await bcrypt.compare(current, row.password))) {
    // Подбор через эту форму - такой же подбор, как на входе, только с
    // другой стороны
    await recordAttempt(reauthKey, "reauth");
    return { fieldErrors: { currentPassword: "Текущий пароль неверный" } };
  }
  await clearAttempts(reauthKey, "reauth");

  if (await bcrypt.compare(password, row.password)) {
    return { fieldErrors: { password: "Новый пароль совпадает со старым" } };
  }

  const hash = await bcrypt.hash(password, 10);
  await db
    .update(users)
    .set({ password: hash, passwordChangedAt: new Date(), sessionVersion: bumpSessionVersion })
    .where(eq(users.id, Number(user.id)));

  // Смена пароля отзывает все сессии, включая текущую. Отправляем на вход
  // с понятной причиной, а не оставляем на странице, с которой человека
  // тут же выкинет на следующем переходе.
  redirect("/login?reason=password-changed");
}
