import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { orderChats, chatMessages, users } from "@/db/schema";

/**
 * Переписка по заказу.
 *
 * Обычный серверный модуль, а не серверное действие: функция принимает
 * номер заказа, и будь она действием, её мог бы вызвать кто угодно с
 * любым номером. Право доступа проверяет страница, которая её зовёт.
 */
export type ChatMessage = {
  id: number;
  message: string;
  createdAt: Date | null;
  authorId: number;
  authorName: string;
  authorRole: string | null;
};

export async function readOrderMessages(orderId: number): Promise<ChatMessage[]> {
  const [chat] = await db
    .select({ id: orderChats.id })
    .from(orderChats)
    .where(eq(orderChats.orderId, orderId))
    .limit(1);

  if (!chat) return [];

  return db
    .select({
      id: chatMessages.id,
      message: chatMessages.message,
      createdAt: chatMessages.createdAt,
      authorId: chatMessages.userId,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.userId))
    .where(eq(chatMessages.chatId, chat.id))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(200);
}
