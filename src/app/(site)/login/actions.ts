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
import { issueLoginChallenge, verifyLoginChallenge } from "@/lib/login-challenge";

/**
 * `needsTotp` показывает форме поле одноразового кода, `challenge` - токен
 * второго шага: форма кладёт его в скрытое поле, и с ним второй шаг
 * проходит без повторной капчи.
 */
export type LoginState = { error?: string; needsTotp?: boolean; challenge?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const redirectTo = String(formData.get("redirectTo") || "/client/dashboard");
  const email = String(formData.get("email") ?? "");
  const givenChallenge = String(formData.get("loginChallenge") ?? "");

  // Капчу проверяем до подбора пароля: она и нужна, чтобы отсечь
  // автоматический перебор. Пропускаем её только на втором шаге и только
  // с токеном, который выдан за верный пароль к этой же почте. Одного
  // непустого поля кода мало: его допишет к запросу любой бот
  const passedChallenge =
    formData.get("totp") !== null && verifyLoginChallenge(givenChallenge, email);

  if (!passedChallenge) {
    const ok = await verifyTurnstile(
      String(formData.get("cf-turnstile-response") ?? ""),
      await clientIp(),
    );
    if (!ok) {
      // Токен был, но истёк или не подошёл: человек долго искал код.
      // Говорим, что делать, а не просто «вы робот»
      return {
        error: givenChallenge
          ? "Время на ввод кода вышло. Подтвердите, что вы не робот, и войдите ещё раз"
          : TURNSTILE_FAILED_MESSAGE,
      };
    }
  }

  // Действующий токен возвращаем как есть, а не выдаём новый: иначе
  // каждая ошибка в коде продлевала бы окно без капчи бесконечно.
  // Новый - только если капча пройдена в этом запросе
  const challenge = () => (passedChallenge ? givenChallenge : issueLoginChallenge(email));

  try {
    await signIn("credentials", {
      email,
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

    // Обе ошибки authorize бросает только после верного пароля - значит,
    // токен второго шага выдаём именно здесь
    if (error instanceof TotpRequiredError) {
      return {
        needsTotp: true,
        challenge: challenge(),
        error: "Введите код из приложения-аутентификатора",
      };
    }

    if (error instanceof TotpInvalidError) {
      return {
        needsTotp: true,
        challenge: challenge(),
        error: "Код не подошёл - попробуйте следующий",
      };
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
