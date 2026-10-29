"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/auth";
import { audit } from "@/lib/audit";
import { generateSecret, otpauthUrl } from "@/lib/totp";
import { consumeTotp } from "@/lib/totp-db";
import { bumpSessionVersion } from "@/lib/sessions-db";
import { checkRateLimit, recordAttempt, clearAttempts, retryAfterText } from "@/lib/rate-limit";
import { textQrSvg } from "@/lib/payment-qr";

/**
 * Лимит на повторные подтверждения вошедшего пользователя (код, пароль).
 * Проверяется до дорогой проверки: после неё он ничего бы не экономил.
 */
async function reauthBlocked(userId: number) {
  const limit = await checkRateLimit(`reauth:${userId}`, "reauth");
  return limit.ok ? null : `Слишком много попыток. Попробуйте ${retryAfterText(limit.retryAfter)}`;
}

export type TwoFactorState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Секрет и QR показываем один раз - на шаге подтверждения. */
  secret?: string;
  qr?: string;
};

/**
 * Второй фактор для сотрудников.
 *
 * Заводится в два шага: сначала секрет и QR, потом подтверждение кодом.
 * Пока код не подтверждён, вход по нему не спрашивается - иначе человек,
 * закрывший вкладку на середине, потерял бы доступ к админке.
 */
// Второй аргумент (formData) здесь не нужен: кнопка ничего не передаёт.
// Функция с одним параметром подходит useActionState - лишний аргумент
// JS просто отбросит
export async function startTwoFactor(
  prev: TwoFactorState,
): Promise<TwoFactorState> {
  // Повторное нажатие не должно выдавать новый секрет: человек в этот
  // момент как раз сканирует показанный QR, и подменять его под рукой -
  // худшее, что можно сделать
  if (prev.secret && prev.qr) return prev;

  const me = await currentUser();
  if (!me) return { error: "Нужно войти" };
  if (me.role === "user") {
    return { error: "Второй фактор включается сотрудникам" };
  }

  const [row] = await db
    .select({ totpEnabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, Number(me.id)))
    .limit(1);

  if (row?.totpEnabledAt) {
    return { error: "Второй фактор уже включён - сначала отключите его" };
  }

  const secret = generateSecret();

  // Секрет кладём сразу: без этого его пришлось бы держать в сессии или
  // прятать в скрытом поле формы, где он был бы виден в разметке
  await db
    .update(users)
    // Счётчик последнего кода сбрасываем: он относился к прежнему секрету
    .set({ totpSecret: secret, totpEnabledAt: null, totpLastCounter: null })
    .where(eq(users.id, Number(me.id)));

  const qr = await textQrSvg(otpauthUrl(secret, me.email), 180);

  return {
    ok: true,
    secret,
    qr,
    message: "Отсканируйте код в приложении и введите шестизначный код ниже",
  };
}

/** Подтверждение: код из приложения включает второй фактор. */
export async function confirmTwoFactor(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const me = await currentUser();
  if (!me) return { error: "Нужно войти" };

  const [row] = await db
    .select({ secret: users.totpSecret, enabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, Number(me.id)))
    .limit(1);

  if (!row?.secret) return { error: "Сначала заведите секрет" };
  if (row.enabledAt) return { error: "Второй фактор уже включён" };

  const blocked = await reauthBlocked(Number(me.id));
  if (blocked) return { error: blocked };

  const code = String(formData.get("code") ?? "");
  if (!(await consumeTotp(Number(me.id), row.secret, code))) {
    await recordAttempt(`reauth:${me.id}`, "reauth");
    return { error: "Код не подошёл или уже использован. Проверьте время на телефоне и дождитесь нового кода" };
  }
  await clearAttempts(`reauth:${me.id}`, "reauth");

  await db
    .update(users)
    .set({ totpEnabledAt: new Date() })
    .where(eq(users.id, Number(me.id)));

  await audit("user.totp_enabled", { type: "user", id: Number(me.id) });
  revalidatePath("/client/settings");

  return { ok: true, message: "Второй фактор включён. Теперь вход спросит код" };
}

/**
 * Отключение. Требует пароль и действующий код: иначе достаточно оставить
 * открытой чужую вкладку (или знать пароль), чтобы снять второй фактор с
 * чужого аккаунта. После отключения все сессии отзываются, включая эту:
 * человек входит заново уже без кода.
 */
export async function disableTwoFactor(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const me = await currentUser();
  if (!me) return { error: "Нужно войти" };

  const blocked = await reauthBlocked(Number(me.id));
  if (blocked) return { error: blocked };

  const [row] = await db
    .select({
      password: users.password,
      secret: users.totpSecret,
      enabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, Number(me.id)))
    .limit(1);
  if (!row) return { error: "Пользователь не найден" };

  const password = String(formData.get("password") ?? "");
  if (!password || !(await bcrypt.compare(password, row.password))) {
    await recordAttempt(`reauth:${me.id}`, "reauth");
    return { error: "Неверный пароль" };
  }

  if (row.enabledAt && row.secret) {
    const code = String(formData.get("code") ?? "");
    if (!(await consumeTotp(Number(me.id), row.secret, code))) {
      await recordAttempt(`reauth:${me.id}`, "reauth");
      return { error: "Код не подошёл или уже использован. Дождитесь нового кода в приложении и введите его" };
    }
  }
  await clearAttempts(`reauth:${me.id}`, "reauth");

  // Журнал - до отзыва сессий: audit() узнаёт автора по текущей сессии,
  // а после отзыва её уже нет
  await audit("user.totp_disabled", { type: "user", id: Number(me.id) });

  await db
    .update(users)
    .set({
      totpSecret: null,
      totpEnabledAt: null,
      totpLastCounter: null,
      sessionVersion: bumpSessionVersion,
    })
    .where(eq(users.id, Number(me.id)));

  // redirect бросает исключение, поэтому он последний: сессия уже отозвана,
  // и оставаться на странице, с которой выкинет при следующем переходе, нечего
  redirect("/login?reason=two-factor-disabled");
}
