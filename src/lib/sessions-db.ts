import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Значение для `.set({ sessionVersion: bumpSessionVersion })` в UPDATE
 * пользователя: поднимает версию сессий на единицу и отзывает все выданные
 * токены (см. `lib/session-policy.ts`). Увеличивать надо в том же UPDATE,
 * который меняет пароль, блокировку или второй фактор, - тогда отзыв и
 * сама смена не разойдутся.
 */
export const bumpSessionVersion = sql`${users.sessionVersion} + 1`;

/** Отозвать все сессии пользователя (кнопка «Выйти со всех устройств»). */
export async function revokeAllSessions(userId: number) {
  await db
    .update(users)
    .set({ sessionVersion: bumpSessionVersion })
    .where(eq(users.id, userId));
}
