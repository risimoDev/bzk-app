import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { isCredentialsAuthPath } from "@/lib/login-challenge";

export const { GET } = handlers;

/**
 * Вход по паролю через HTTP-маршрут Auth.js закрыт.
 *
 * Форма входа зовёт signIn из серверного действия, а он обращается к
 * Auth.js прямо в процессе (`Auth(req, { skipCSRFCheck })` в
 * next-auth/lib/actions.js), сюда по HTTP не ходит. Открытый
 * POST /api/auth/callback/credentials вызывал бы authorize в обход
 * действия - без капчи и без токена второго шага, и подбор пароля шёл
 * бы мимо Turnstile.
 */
export async function POST(req: NextRequest) {
  if (isCredentialsAuthPath(req.nextUrl.pathname)) {
    return new Response("Not Found", { status: 404 });
  }
  return handlers.POST(req);
}
