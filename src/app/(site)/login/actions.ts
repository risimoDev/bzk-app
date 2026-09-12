"use server";

import { AuthError } from "next-auth";
import {
  signIn,
  TooManyAttemptsError,
  TotpInvalidError,
  TotpRequiredError,
} from "@/auth";
import { verifyTurnstile, TURNSTILE_FAILED_MESSAGE } from "@/lib/turnstile";
import { clientIp } from "@/lib/client-ip";

/** `needsTotp` показывает форме поле одноразового кода. */
export type LoginState = { error?: string; needsTotp?: boolean };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const redirectTo = String(formData.get("redirectTo") || "/client/dashboard");

  // Капчу проверяем до подбора пароля: она и нужна, чтобы отсечь
  // автоматический перебор. Второй шаг входа (ввод кода 2FA) капчу
  // не переспрашивает - токен одноразовый, а человек уже подтверждён
  if (!formData.get("totp")) {
    const ok = await verifyTurnstile(
      String(formData.get("cf-turnstile-response") ?? ""),
      await clientIp(),
    );
    if (!ok) return { error: TURNSTILE_FAILED_MESSAGE };
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      // Пустая строка, а не null: значение уезжает в тело запроса, и
      // null там превращается в строку «null» - код бы «не подошёл»
      // вместо честного «введите код»
      totp: String(formData.get("totp") ?? ""),
      redirectTo,
    });
    return {};
  } catch (error) {
    // Подбор пароля отбивается счётчиком попыток в authorize. Про отказ
    // говорим прямо: молчаливое «неверный пароль» заставило бы человека,
    // который просто забыл раскладку, долбиться дальше
    if (error instanceof TooManyAttemptsError) {
      return { error: `Слишком много попыток входа. Попробуйте ${error.wait}` };
    }

    if (error instanceof TotpRequiredError) {
      return {
        needsTotp: true,
        error: "Введите код из приложения-аутентификатора",
      };
    }

    if (error instanceof TotpInvalidError) {
      return { needsTotp: true, error: "Код не подошёл - попробуйте следующий" };
    }

    // signIn бросает redirect-ошибку при успехе - её нужно пропустить дальше,
    // иначе перехода не произойдёт и форма просто «залипнет».
    if (error instanceof AuthError) {
      return {
        error:
          error.type === "CredentialsSignin"
            ? "Неверная почта или пароль"
            : "Не удалось войти. Попробуйте ещё раз",
      };
    }
    throw error;
  }
}
