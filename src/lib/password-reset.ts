import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Смена пароля по ссылке из письма.
 *
 * Отличие от старого сайта одно, но существенное: там ссылка целиком
 * лежала в базе в колонке reset_token. Утечка базы означала бы, что все
 * незакрытые запросы на смену пароля - это готовые захваты аккаунтов.
 * Храним отпечаток, а сама ссылка существует только в письме.
 */

/** Два часа - как и было; за это время письмо успевает дойти и найтись. */
export const RESET_TTL_MINUTES = 120;

/** 32 байта случайности: перебрать нельзя, в адресную строку влезает. */
export function makeResetToken() {
  return randomBytes(32).toString("hex");
}

export function fingerprint(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Выдаёт новую ссылку и гасит предыдущую.
 *
 * Старый сайт при живом токене отказывался выдавать новый и предлагал
 * поискать письмо. Это тупик: письмо могло не дойти, а ждать надо было
 * два часа. Ограничение частоты стоит уровнем выше, и оно решает ту же
 * задачу, не запирая человека.
 */
export async function issueResetToken(userId: number) {
  const token = makeResetToken();

  await db
    .update(users)
    .set({
      resetToken: fingerprint(token),
      resetTokenExpires: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    })
    .where(eq(users.id, userId));

  return token;
}

export type ResetTarget = { id: number; name: string; email: string };

/** Чей это токен, если он ещё живой. */
export async function findByResetToken(token: string): Promise<ResetTarget | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      stored: users.resetToken,
    })
    .from(users)
    .where(
      and(
        eq(users.resetToken, fingerprint(token)),
        gt(users.resetTokenExpires, new Date()),
        eq(users.isBlocked, false),
      ),
    )
    .limit(1);

  if (!row?.stored) return null;

  // Сравнение уже произошло в запросе, но повторяем его с постоянным
  // временем: так поиск по отпечатку не подскажет, насколько близко
  // подобранное значение
  const a = Buffer.from(row.stored, "utf8");
  const b = Buffer.from(fingerprint(token), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { id: row.id, name: row.name, email: row.email };
}

/** Токен одноразовый: после смены пароля он должен перестать работать. */
export async function clearResetToken(userId: number) {
  await db
    .update(users)
    .set({ resetToken: null, resetTokenExpires: null })
    .where(eq(users.id, userId));
}
