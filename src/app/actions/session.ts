"use server";

import { currentUser, signOut } from "@/auth";
import { audit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/sessions-db";

export async function logout() {
  await signOut({ redirectTo: "/" });
}

/**
 * «Выйти со всех устройств». Поднимает версию сессий пользователя: все
 * выданные токены, включая этот, перестают проходить проверку при
 * следующем же запросе (lib/session-policy.ts). Нужно, когда телефон
 * потерян или пароль мог видеть кто-то ещё.
 */
export async function logoutEverywhere() {
  const me = await currentUser();
  if (!me) return;

  // Журнал - до отзыва: автора он определяет по текущей сессии
  await audit("user.sessions_revoked", { type: "user", id: Number(me.id) });
  await revokeAllSessions(Number(me.id));

  await signOut({ redirectTo: "/login?reason=signed-out-everywhere" });
}
