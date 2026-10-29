"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "@/auth";
import { registerSchema } from "@/lib/validation";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";
import { verifyTurnstile, TURNSTILE_FAILED_MESSAGE } from "@/lib/turnstile";
import { rejectOverlong } from "@/lib/text-limits";

export type RegisterState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function register(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  // Капча до создания аккаунта: массовую регистрацию ботами отсекаем
  // раньше, чем трогаем базу
  const captchaOk = await verifyTurnstile(
    String(formData.get("cf-turnstile-response") ?? ""),
    await clientIp(),
  );
  if (!captchaOk) return { error: TURNSTILE_FAILED_MESSAGE };

  const { name, email, phone, password } = parsed.data;

  /**
   * Три регистрации с одного адреса за четверть часа - столько же, сколько
   * было на старом сайте. Ограничение стоит после разбора формы: опечатка
   * в поле не должна съедать попытку.
   */
  const ip = await clientIp();
  const limit = await checkRateLimit(ip, "register");
  const daily = await checkRateLimit(ip, "registerDay");
  if (!limit.ok || !daily.ok) {
    return {
      error: `Слишком много регистраций с этого адреса. Попробуйте ${retryAfterText(Math.max(limit.retryAfter, daily.retryAfter))}`,
    };
  }
  // Считаем и попытки на занятый адрес: ответ ниже честно говорит «адрес
  // уже зарегистрирован», и без потолка по адресу так можно проверять, кто
  // у нас клиент
  await recordAttempt(ip, "register");
  await recordAttempt(ip, "registerDay");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Одинаковый ответ для занятого и свободного адреса тут невозможен:
  // регистрация сразу входит в только что созданный аккаунт, а для
  // чужого адреса войти нельзя. Не ломаем поток (подтверждение почты
  // перед входом - отдельное продуктовое решение), а ограничиваем
  // перебор лимитами выше
  if (existing) {
    return { fieldErrors: { email: "Этот адрес уже зарегистрирован" } };
  }

  // Стоимость 10 - как в старом сайте, чтобы новые и старые хеши
  // проверялись одинаково быстро
  const hash = await bcrypt.hash(password, 10);

  try {
    await db.insert(users).values({
      name,
      email,
      phone: phone || null,
      password: hash,
      role: "user",
    });
  } catch {
    return { error: "Не удалось создать аккаунт. Попробуйте ещё раз" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/client/dashboard",
    });
    return {};
  } catch (error) {
    // Успешный signIn бросает redirect - его пропускаем наружу
    if (error instanceof AuthError) {
      return { error: "Аккаунт создан, но войти не получилось. Войдите вручную" };
    }
    throw error;
  }
}
