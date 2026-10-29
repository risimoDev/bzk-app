"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contactMessages, reviews, promocodes } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { rejectOverlong } from "@/lib/text-limits";
import { parseCalendarDate, calendarDateAtNoon } from "@/lib/dates";

export type InboxState = { ok: boolean; message?: string };

const DENIED: InboxState = { ok: false, message: "Нет прав на этот раздел" };

// ------------------------------------------------- обращения с сайта

export async function setMessageStatus(
  _prev: InboxState,
  formData: FormData,
): Promise<InboxState> {
  if (!(await can("messaging", "edit"))) return DENIED;

  const messageId = Number(formData.get("messageId"));
  const raw = String(formData.get("status") ?? "");

  if (!Number.isInteger(messageId)) return { ok: false, message: "Обращение не найдено" };
  if (raw !== "new" && raw !== "read") return { ok: false, message: "Неизвестный статус" };

  const updated = await db
    .update(contactMessages)
    .set({ status: raw })
    .where(eq(contactMessages.id, messageId))
    .returning({ id: contactMessages.id });

  if (updated.length === 0) return { ok: false, message: "Обращение не найдено" };

  revalidatePath("/admin/inbox");
  return { ok: true, message: raw === "read" ? "Отмечено прочитанным" : "Возвращено в новые" };
}

export async function deleteMessage(
  _prev: InboxState,
  formData: FormData,
): Promise<InboxState> {
  // Действия «delete» у модуля messaging в правах нет вовсе - ни у одной
  // роли. Ближайшее по смыслу «edit» есть только у администратора, им и
  // ограничиваем: спам чистить нужно, но не всем подряд
  if (!(await can("messaging", "edit"))) {
    return { ok: false, message: "Удалять обращения может администратор" };
  }

  const messageId = Number(formData.get("messageId"));
  if (!Number.isInteger(messageId)) return { ok: false, message: "Обращение не найдено" };

  const removed = await db
    .delete(contactMessages)
    .where(eq(contactMessages.id, messageId))
    .returning({ id: contactMessages.id });

  if (removed.length === 0) return { ok: false, message: "Обращение не найдено" };

  await audit("message.delete", { type: "contact_message", id: messageId });

  revalidatePath("/admin/inbox");
  return { ok: true, message: "Удалено" };
}

// -------------------------------------------------------------- отзывы

export async function setReviewStatus(
  _prev: InboxState,
  formData: FormData,
): Promise<InboxState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  if (!(await can("messaging", "edit"))) return DENIED;

  const reviewId = Number(formData.get("reviewId"));
  const raw = String(formData.get("status") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();

  if (!Number.isInteger(reviewId)) return { ok: false, message: "Отзыв не найден" };
  if (!["pending", "approved", "rejected"].includes(raw)) {
    return { ok: false, message: "Неизвестный статус" };
  }

  const status = raw as "pending" | "approved" | "rejected";

  // Отклонённый отзыв без объяснения непонятен ни автору, ни коллеге,
  // который откроет карточку через месяц
  if (status === "rejected" && comment === "") {
    return { ok: false, message: "Напишите, почему отзыв отклонён" };
  }

  const updated = await db
    .update(reviews)
    .set({ status, comment: comment || null })
    .where(eq(reviews.id, reviewId))
    .returning({ id: reviews.id });

  if (updated.length === 0) return { ok: false, message: "Отзыв не найден" };

  await audit("review.status", { type: "review", id: reviewId }, { status });

  revalidatePath("/admin/inbox");
  return { ok: true, message: "Сохранено" };
}

// ---------------------------------------------------------- промокоды

export async function togglePromocode(
  _prev: InboxState,
  formData: FormData,
): Promise<InboxState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Менять промокоды может администратор" };
  }

  const promoId = Number(formData.get("promoId"));
  const active = formData.get("active") === "1";

  if (!Number.isInteger(promoId)) return { ok: false, message: "Промокод не найден" };

  const updated = await db
    .update(promocodes)
    .set({ isActive: active })
    .where(eq(promocodes.id, promoId))
    .returning({ code: promocodes.code });

  if (updated.length === 0) return { ok: false, message: "Промокод не найден" };

  await audit("promocode.toggle", { type: "promocode", id: promoId }, { active });

  revalidatePath("/admin/promocodes");
  return {
    ok: true,
    message: `${updated[0].code}: ${active ? "включён" : "выключен"}`,
  };
}

// ------------------------------------------------ заведение промокодов

export type PromocodeState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Новый или изменённый промокод.
 *
 * Счётчик применений не трогаем: в перенесённых кодах он уже накопил
 * семнадцать использований со старого сайта, и обнулять его значило бы
 * выдать заново уже потраченные разовые коды.
 */
export async function savePromocode(
  _prev: PromocodeState,
  formData: FormData,
): Promise<PromocodeState> {
  const tooLong = rejectOverlong(formData, { code: 50 });
  if (tooLong) return tooLong;

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("settings", isNew ? "create" : "edit"))) {
    return { error: "Нет прав менять промокоды" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Промокод не найден" };
  }

  const code = String(formData.get("code") ?? "").trim().toUpperCase().slice(0, 50);
  if (!/^[A-ZА-Я0-9_-]{3,50}$/.test(code)) {
    return { fieldErrors: { code: "Код: 3–50 знаков, буквы, цифры, дефис" } };
  }

  const discountType =
    String(formData.get("discountType") ?? "percentage") === "fixed"
      ? "fixed"
      : "percentage";

  const rawValue = String(formData.get("discountValue") ?? "").trim().replace(",", ".");
  const discountValue = Number(rawValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { fieldErrors: { discountValue: "Скидка больше нуля" } };
  }
  if (discountType === "percentage" && discountValue > 100) {
    return { fieldErrors: { discountValue: "Процент не больше 100" } };
  }

  const optionalNumber = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  const minOrder = optionalNumber("minOrderAmount");
  const maxDiscount = optionalNumber("maxDiscountAmount");
  if (Number.isNaN(minOrder)) return { fieldErrors: { minOrderAmount: "Сумма вида 1234.56" } };
  if (Number.isNaN(maxDiscount)) {
    return { fieldErrors: { maxDiscountAmount: "Сумма вида 1234.56" } };
  }

  const rawLimit = String(formData.get("usageLimit") ?? "").trim();
  const usageLimit = rawLimit === "" ? null : Number(rawLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
    return { fieldErrors: { usageLimit: "Лимит - целое число больше нуля" } };
  }

  // Пусто - без границы; выдуманное число (31 февраля) - ошибка, а не
  // молчаливое «без границы». Полдень по местному: иначе календарный день
  // съезжает при пересчёте часового пояса
  const dateErrors: Record<string, string> = {};
  const parseDate = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") return null;
    const day = parseCalendarDate(raw);
    if (!day) {
      dateErrors[name] = "Такой даты нет в календаре";
      return null;
    }
    return calendarDateAtNoon(day);
  };

  const values = {
    code,
    discountType: discountType as "percentage" | "fixed",
    discountValue: discountValue.toFixed(2),
    minOrderAmount: minOrder === null ? null : minOrder.toFixed(2),
    maxDiscountAmount: maxDiscount === null ? null : maxDiscount.toFixed(2),
    usageLimit,
    startDate: parseDate("startDate"),
    endDate: parseDate("endDate"),
    description: String(formData.get("description") ?? "").trim().slice(0, 1000) || null,
    isSingleUse: formData.get("isSingleUse") === "on",
    isActive: formData.get("isActive") === "on",
  };

  if (Object.keys(dateErrors).length > 0) return { fieldErrors: dateErrors };

  if (Object.keys(dateErrors).length > 0) return { fieldErrors: dateErrors };

  try {
    if (isNew) {
      const [created] = await db
        .insert(promocodes)
        .values(values)
        .returning({ id: promocodes.id });
      await audit("promocode.create", { type: "promocode", id: created.id }, { code });
    } else {
      await db.update(promocodes).set(values).where(eq(promocodes.id, id));
      await audit("promocode.update", { type: "promocode", id }, { code });
    }
  } catch {
    // Уникальный индекс на коде - единственная ошибка, которая тут
    // реально случается
    return { fieldErrors: { code: "Такой код уже есть" } };
  }

  revalidatePath("/admin/promocodes");
  return { ok: true, message: isNew ? "Промокод заведён" : "Сохранено" };
}
