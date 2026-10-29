import "server-only";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramLinkCodes, users } from "@/db/schema";
import {
  generateLinkCode,
  linkCodeExpiry,
  linkCodeHash,
  normalizeLinkCode,
} from "@/lib/telegram-link";
import { sendMail, isMailConfigured, escapeHtml } from "@/lib/mail";
import { site } from "@/lib/site";

/**
 * Выдача и погашение кодов привязки телеграма (чистая часть - в
 * `telegram-link.ts`).
 */

/**
 * Выдаёт новый код пользователю. Прежний его код гасится: активный код
 * один, иначе забытые «на всякий случай» копились бы живыми. Заодно
 * удаляются все просроченные коды, чьи бы они ни были, - отдельной уборки
 * при выдаче не нужно.
 */
export async function issueLinkCode(userId: number) {
  const code = generateLinkCode();

  await db.transaction(async (tx) => {
    // Две выдачи одного пользователя разом (двойной щелчок, две вкладки)
    // обе успели бы удалить старый код и вставить свой - остались бы два
    // живых. Блокировка на пользователя ставит их в очередь: вторая
    // удалит код первой. Первое число - «пространство» блокировок кодов
    await tx.execute(sql`select pg_advisory_xact_lock(7002, ${userId})`);

    await tx
      .delete(telegramLinkCodes)
      .where(
        or(
          eq(telegramLinkCodes.userId, userId),
          lt(telegramLinkCodes.expiresAt, new Date()),
        ),
      );

    await tx.insert(telegramLinkCodes).values({
      userId,
      codeHash: linkCodeHash(code),
      expiresAt: linkCodeExpiry(),
    });
  });

  return code;
}

/**
 * Гасит код и отдаёт, чей он. Один DELETE ... RETURNING: два одновременных
 * ввода одного кода не пройдут оба - вернёт строку только один из них.
 * Мусор отсеивается до базы.
 */
export async function consumeLinkCode(raw: string): Promise<number | null> {
  const code = normalizeLinkCode(raw);
  if (!code) return null;

  const [row] = await db
    .delete(telegramLinkCodes)
    .where(
      and(
        eq(telegramLinkCodes.codeHash, linkCodeHash(code)),
        gt(telegramLinkCodes.expiresAt, new Date()),
      ),
    )
    .returning({ userId: telegramLinkCodes.userId });

  return row?.userId ?? null;
}

export type LinkedUser = { id: number; name: string; email: string };

/**
 * Привязывает чат к аккаунту. Один чат - один аккаунт: с прежнего владельца
 * привязку снимаем, иначе уведомления пошли бы двоим. Null - аккаунта нет
 * или он заблокирован.
 */
export async function linkChatToUser(
  userId: number,
  chatId: number | string,
): Promise<LinkedUser | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isBlocked: users.isBlocked,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.isBlocked) return null;

    await tx
      .update(users)
      .set({ telegramChatId: null })
      .where(eq(users.telegramChatId, String(chatId)));

    await tx
      .update(users)
      .set({ telegramChatId: String(chatId), telegramNotifications: true })
      .where(eq(users.id, user.id));

    return { id: user.id, name: user.name, email: user.email };
  });
}

/**
 * Письмо владельцу аккаунта: к нему привязан телеграм. Привязка даёт
 * чужому чату уведомления о заказах, и если её сделал не хозяин, он
 * должен узнать об этом сразу. Почта не настроена - письма нет, и это
 * не ошибка (на разработке SMTP чаще всего пуст).
 */
export async function sendTelegramLinkedNotice(user: LinkedUser) {
  if (!isMailConfigured()) return null;

  return sendMail({
    to: user.email,
    subject: `К аккаунту привязан Telegram - ${site.name}`,
    text:
      `${user.name}, к вашему аккаунту на ${site.name} привязан чат в Telegram: ` +
      `туда теперь приходят уведомления о заказах.\n\n` +
      `Если это были вы, ничего делать не нужно. Если нет - отправьте боту ` +
      `команду /disconnect, смените пароль в профиле и позвоните нам: ${site.phone}.`,
    html:
      `<p>${escapeHtml(user.name)}, к вашему аккаунту на ${escapeHtml(site.name)} привязан чат в Telegram: ` +
      `туда теперь приходят уведомления о заказах.</p>` +
      `<p>Если это были вы, ничего делать не нужно. Если нет - отправьте боту команду ` +
      `<b>/disconnect</b>, смените пароль в профиле и позвоните нам: ${escapeHtml(site.phone)}.</p>`,
  });
}
