"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  orderChats,
  chatMessages,
  clientUploads,
  miniWarehouseItems,
  supportTickets,
  supportTicketMessages,
  users,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { saveUpload, removeUpload } from "@/lib/uploads";
import { isTicketClosed, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/client-portal";
import { localDate } from "@/lib/dates";
import { nextTicketNumber } from "@/lib/numbering-db";
import { notifyStaff } from "@/lib/notify";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";

export type ActionState = { ok: boolean; message?: string };

const DENIED: ActionState = { ok: false, message: "Нужно войти в кабинет" };

/** Заказ принадлежит этому клиенту? Без проверки чужой номер открыл бы чужой заказ. */
async function ownsOrder(userId: number, orderId: number) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return Boolean(row);
}

// ------------------------------------------------------------ переписка

export async function sendOrderMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const orderId = Number(formData.get("orderId"));
  const message = String(formData.get("message") ?? "").trim();

  if (!Number.isInteger(orderId) || !(await ownsOrder(userId, orderId))) {
    return { ok: false, message: "Заказ не найден" };
  }
  if (message === "") return { ok: false, message: "Сообщение пустое" };
  if (message.length > 4000) {
    return { ok: false, message: "Слишком длинное сообщение - до 4000 символов" };
  }

  await db.transaction(async (tx) => {
    // Обсуждение заводится при первом сообщении: пустых веток по заказам,
    // где никто ничего не писал, быть не должно
    const [existing] = await tx
      .select({ id: orderChats.id })
      .from(orderChats)
      .where(eq(orderChats.orderId, orderId))
      .limit(1);

    const chatId =
      existing?.id ??
      (
        await tx
          .insert(orderChats)
          .values({ orderId })
          .returning({ id: orderChats.id })
      )[0].id;

    await tx.insert(chatMessages).values({ chatId, userId, message });
    await tx
      .update(orderChats)
      .set({ updatedAt: new Date() })
      .where(eq(orderChats.id, chatId));
  });

  // Пока уведомления не звали, сообщение клиента лежало в базе, и
  // менеджер узнавал о нём, только если сам открывал заказ
  await notifyStaff(
    "order_message",
    `Заказ № ${orderId}`,
    `<b>Сообщение по заказу № ${orderId}</b>\n${esc(user.name)}: ${esc(message.slice(0, 300))}`,
    [[{ text: "Открыть заказ", url: absoluteUrl(`/admin/orders/${orderId}`) }]],
  );

  revalidatePath(`/client/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

// --------------------------------------------------------------- файлы

export async function uploadClientFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const file = formData.get("file");
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);

  const rawOrder = String(formData.get("orderId") ?? "").trim();
  const orderId = rawOrder === "" ? null : Number(rawOrder);

  if (!(file instanceof File)) return { ok: false, message: "Файл не выбран" };

  if (orderId !== null) {
    if (!Number.isInteger(orderId) || !(await ownsOrder(userId, orderId))) {
      return { ok: false, message: "Заказ не найден" };
    }
  }

  let saved;
  try {
    saved = await saveUpload(file);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Не удалось сохранить файл" };
  }

  await db.insert(clientUploads).values({
    userId,
    orderId,
    filename: saved.filename,
    originalName: saved.originalName,
    fileSize: saved.size,
    mimeType: saved.mimeType,
    description: description || null,
  });

  revalidatePath("/client/uploads");
  if (orderId) revalidatePath(`/client/orders/${orderId}`);
  return { ok: true, message: `Файл «${saved.originalName}» загружен` };
}

export async function deleteClientFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const fileId = Number(formData.get("fileId"));
  if (!Number.isInteger(fileId)) return { ok: false, message: "Файл не найден" };

  const [row] = await db
    .select()
    .from(clientUploads)
    .where(and(eq(clientUploads.id, fileId), eq(clientUploads.userId, userId)))
    .limit(1);

  if (!row) return { ok: false, message: "Файл не найден" };

  // Принятый в работу макет удалять нельзя: по нему уже печатают, и
  // исчезнувший исходник потом не с чем сверить
  if (row.status === "approved") {
    return { ok: false, message: "Файл принят в работу - удалить его может только менеджер" };
  }

  await db.delete(clientUploads).where(eq(clientUploads.id, fileId));
  await removeUpload(row.filename);

  revalidatePath("/client/uploads");
  if (row.orderId) revalidatePath(`/client/orders/${row.orderId}`);
  return { ok: true, message: "Файл удалён" };
}

// ----------------------------------------------------------- мини-склад

/** Мини-склад - платная услуга, включается клиенту вручную. */
async function warehouseAllowed(userId: number) {
  const [row] = await db
    .select({ enabled: users.miniWarehouseEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.enabled === true;
}

export async function saveWarehouseItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  if (!(await warehouseAllowed(userId))) {
    return { ok: false, message: "Раздел вам не подключён" };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 255);
  const description = String(formData.get("description") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const rawId = String(formData.get("itemId") ?? "").trim();

  if (name === "") return { ok: false, message: "Впишите название" };
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { ok: false, message: "Количество - целое число, не меньше нуля" };
  }

  if (rawId === "") {
    await db.insert(miniWarehouseItems).values({
      userId,
      name,
      description: description || null,
      quantity,
    });
  } else {
    const itemId = Number(rawId);
    if (!Number.isInteger(itemId)) return { ok: false, message: "Позиция не найдена" };

    const updated = await db
      .update(miniWarehouseItems)
      .set({ name, description: description || null, quantity })
      .where(
        and(eq(miniWarehouseItems.id, itemId), eq(miniWarehouseItems.userId, userId)),
      )
      .returning({ id: miniWarehouseItems.id });

    if (updated.length === 0) return { ok: false, message: "Позиция не найдена" };
  }

  revalidatePath("/client/warehouse");
  return { ok: true, message: "Сохранено" };
}

export async function deleteWarehouseItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId)) return { ok: false, message: "Позиция не найдена" };

  const removed = await db
    .delete(miniWarehouseItems)
    .where(and(eq(miniWarehouseItems.id, itemId), eq(miniWarehouseItems.userId, userId)))
    .returning({ id: miniWarehouseItems.id });

    if (removed.length === 0) return { ok: false, message: "Позиция не найдена" };

  revalidatePath("/client/warehouse");
  return { ok: true, message: "Позиция удалена" };
}

// ------------------------------------------------------------ обращения

export async function createTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 255);
  const message = String(formData.get("message") ?? "").trim();
  const category = String(formData.get("category") ?? "general");
  const priority = String(formData.get("priority") ?? "normal");

  const rawOrder = String(formData.get("orderId") ?? "").trim();
  const orderId = rawOrder === "" ? null : Number(rawOrder);

  if (subject === "") return { ok: false, message: "Впишите тему обращения" };
  if (message === "") return { ok: false, message: "Опишите вопрос" };
  if (!(category in TICKET_CATEGORIES)) return { ok: false, message: "Неизвестная категория" };
  if (!(priority in TICKET_PRIORITIES)) return { ok: false, message: "Неизвестный приоритет" };

  if (orderId !== null) {
    if (!Number.isInteger(orderId) || !(await ownsOrder(userId, orderId))) {
      return { ok: false, message: "Заказ не найден" };
    }
  }

  // Номер обращения: TK-ГГГГММДД-NNNN, нумерация внутри дня. Его выдаёт
  // атомарный счётчик дня: max + 1 пересекался у двух обращений, поданных
  // одновременно, и второе падало ошибкой на уникальном индексе.
  const ymd = localDate().replaceAll("-", "");

  const number = await db.transaction(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx, ymd);

    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        ticketNumber,
        userId,
        orderId,
        subject,
        category: category as keyof typeof TICKET_CATEGORIES,
        priority: priority as keyof typeof TICKET_PRIORITIES,
      })
      .returning({ id: supportTickets.id });

    await tx.insert(supportTicketMessages).values({
      ticketId: ticket.id,
      userId,
      message,
    });

    return ticketNumber;
  });

  revalidatePath("/client/support");
  return { ok: true, message: `Обращение ${number} создано` };
}

export async function replyToTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const ticketId = Number(formData.get("ticketId"));
  const message = String(formData.get("message") ?? "").trim();

  if (!Number.isInteger(ticketId)) return { ok: false, message: "Обращение не найдено" };
  if (message === "") return { ok: false, message: "Сообщение пустое" };

  const [ticket] = await db
    .select({ id: supportTickets.id, status: supportTickets.status })
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
    .limit(1);

  if (!ticket) return { ok: false, message: "Обращение не найдено" };
  if (isTicketClosed(ticket.status)) {
    return { ok: false, message: "Обращение закрыто - заведите новое, так вопрос не потеряется" };
  }

  await db.transaction(async (tx) => {
    await tx.insert(supportTicketMessages).values({ ticketId, userId, message });
    // Ответ клиента снимает ожидание: очередь снова за нами
    await tx
      .update(supportTickets)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
  });

  revalidatePath(`/client/support/${ticketId}`);
  revalidatePath("/client/support");
  return { ok: true };
}

// --------------------------------------------------------------- профиль

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  const userId = Number(user.id);
  const name = String(formData.get("name") ?? "").trim().slice(0, 255);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 20);
  const shippingAddress = String(formData.get("shippingAddress") ?? "").trim();
  const birthdayRaw = String(formData.get("birthday") ?? "").trim();

  const isCorporate = formData.get("isCorporate") === "on";
  const companyName = String(formData.get("companyName") ?? "").trim().slice(0, 255);
  const inn = String(formData.get("inn") ?? "").replace(/\D/g, "").slice(0, 12);
  const kpp = String(formData.get("kpp") ?? "").replace(/\D/g, "").slice(0, 9);
  const legalAddress = String(formData.get("legalAddress") ?? "").trim();

  if (name === "") return { ok: false, message: "Впишите имя" };

  if (isCorporate) {
    if (companyName === "") return { ok: false, message: "Впишите название организации" };
    if (inn.length !== 10 && inn.length !== 12) {
      return { ok: false, message: "ИНН - 10 цифр у организации, 12 у предпринимателя" };
    }
    if (kpp !== "" && kpp.length !== 9) return { ok: false, message: "КПП - 9 цифр" };
    if (inn.length === 12 && kpp !== "") {
      return { ok: false, message: "У предпринимателя КПП не бывает - оставьте поле пустым" };
    }
  }

  // Дата хранится календарным днём: строка «ГГГГ-ММ-ДД» уходит в базу
  // как есть, без часовых поясов, иначе день уезжает на сутки назад
  if (birthdayRaw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)) {
    return { ok: false, message: "Проверьте дату рождения" };
  }

  await db
    .update(users)
    .set({
      name,
      phone: phone || null,
      birthday: birthdayRaw || null,
      shippingAddress: shippingAddress || null,
      isCorporate,
      companyName: isCorporate ? companyName : null,
      inn: isCorporate ? inn : null,
      kpp: isCorporate && kpp ? kpp : null,
      legalAddress: isCorporate ? legalAddress || null : null,
    })
    .where(eq(users.id, userId));

  revalidatePath("/client/settings");
  return { ok: true, message: "Профиль сохранён" };
}

export async function updateNotifications(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return DENIED;

  await db
    .update(users)
    .set({
      emailNotifications: formData.get("emailNotifications") === "on",
      smsNotifications: formData.get("smsNotifications") === "on",
      telegramNotifications: formData.get("telegramNotifications") === "on",
      newsletter: formData.get("newsletter") === "on",
    })
    .where(eq(users.id, Number(user.id)));

  revalidatePath("/client/settings");
  return { ok: true, message: "Настройки уведомлений сохранены" };
}
