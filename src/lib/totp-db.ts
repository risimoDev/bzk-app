import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { matchTotpCounter } from "@/lib/totp";

/**
 * Проверка одноразового кода с запоминанием.
 *
 * Код принимается, только если окно, которому он принадлежит, позже
 * последнего принятого (`users.totp_last_counter`). Проверка и запись -
 * один UPDATE ... WHERE ... RETURNING: два одновременных запроса с одним
 * и тем же кодом оба пройдут проверку «подходит», но запись пройдёт у
 * одного, второй увидит уже обновлённый счётчик и получит пустой ответ.
 * Отдельный SELECT перед записью дал бы гонку.
 *
 * Зовите везде, где код проверяется: вход, подтверждение включения,
 * отключение второго фактора.
 */
export async function consumeTotp(userId: number, secret: string, code: string) {
  const counter = matchTotpCounter(secret, code);
  if (counter === null) return false;

  const rows = await db
    .update(users)
    .set({ totpLastCounter: counter })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.totpLastCounter), lt(users.totpLastCounter, counter)),
      ),
    )
    .returning({ id: users.id });

  return rows.length > 0;
}
