"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  documentCategories,
  documentHistory,
  documentTemplates,
  documents,
  orders,
  users,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { isUniqueViolation } from "@/lib/db-errors";
import { nextDocumentNumber } from "@/lib/numbering-db";
import { renderTemplate, type FieldValue, type ItemRow } from "@/lib/document-templates";
import { rejectOverlong } from "@/lib/text-limits";
import { parseCalendarDate } from "@/lib/dates";

export type DocumentState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const STATUSES = ["draft", "pending", "approved", "signed", "cancelled", "archived"] as const;
const TYPES = ["incoming", "internal", "outgoing", "accounting"] as const;

type DocStatus = (typeof STATUSES)[number];
type DocType = (typeof TYPES)[number];

/**
 * Новый документ.
 *
 * Шаблон подставляет своё тело и префикс номера - дальше документ живёт
 * сам по себе: правки шаблона задним числом не должны менять то, что уже
 * отдано клиенту.
 */
export async function createDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const me = await currentUser();
  if (!me || !(await can("documents", "create"))) {
    return { error: "У вашей роли нет права заводить документы" };
  }

  const title = String(formData.get("title") ?? "").trim().slice(0, 255);
  if (title.length < 2) return { fieldErrors: { title: "Впишите название" } };

  const rawTemplate = String(formData.get("templateId") ?? "").trim();
  const templateId = rawTemplate === "" ? null : Number(rawTemplate);
  if (templateId !== null && (!Number.isInteger(templateId) || templateId <= 0)) {
    return { fieldErrors: { templateId: "Шаблон не найден" } };
  }

  const rawCategory = String(formData.get("categoryId") ?? "").trim();
  const categoryId = rawCategory === "" ? null : Number(rawCategory);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return { fieldErrors: { categoryId: "Раздел не найден" } };
  }

  const rawOrder = String(formData.get("orderId") ?? "").trim();
  const orderId = rawOrder === "" ? null : Number(rawOrder);
  if (orderId !== null && (!Number.isInteger(orderId) || orderId <= 0)) {
    return { fieldErrors: { orderId: "Заказ не найден" } };
  }

  const rawUser = String(formData.get("userId") ?? "").trim();
  const userId = rawUser === "" ? null : Number(rawUser);
  if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
    return { fieldErrors: { userId: "Клиент не найден" } };
  }

  const rawStatus = String(formData.get("status") ?? "draft");
  const status = STATUSES.includes(rawStatus as DocStatus)
    ? (rawStatus as DocStatus)
    : "draft";

  const rawType = String(formData.get("docType") ?? "internal");
  const docType = TYPES.includes(rawType as DocType) ? (rawType as DocType) : "internal";

  const rawAmount = String(formData.get("amount") ?? "").trim().replace(/\s/g, "").replace(",", ".");
  let amount: string | null = null;
  if (rawAmount !== "") {
    const n = Number(rawAmount);
    if (!Number.isFinite(n) || n < 0) {
      return { fieldErrors: { amount: "Сумма вида 1234.56" } };
    }
    amount = n.toFixed(2);
  }

  const rawDocumentDate = String(formData.get("documentDate") ?? "").trim();
  const rawValidUntil = String(formData.get("validUntil") ?? "").trim();
  const documentDate = rawDocumentDate === "" ? null : parseCalendarDate(rawDocumentDate);
  const validUntil = rawValidUntil === "" ? null : parseCalendarDate(rawValidUntil);
  if (rawDocumentDate !== "" && !documentDate) {
    return { fieldErrors: { documentDate: "Такой даты нет в календаре" } };
  }
  if (rawValidUntil !== "" && !validUntil) {
    return { fieldErrors: { validUntil: "Такой даты нет в календаре" } };
  }

  // Ссылки проверяем до вставки: несуществующий заказ вставился бы
  // с ошибкой внешнего ключа и упал бы пятисоткой вместо подсказки
  if (orderId !== null) {
    const [row] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return { fieldErrors: { orderId: "Заказ не найден" } };
  }
  if (userId !== null) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return { fieldErrors: { userId: "Клиент не найден" } };
  }
  if (categoryId !== null) {
    const [row] = await db
      .select({ id: documentCategories.id })
      .from(documentCategories)
      .where(eq(documentCategories.id, categoryId))
      .limit(1);
    if (!row) return { fieldErrors: { categoryId: "Раздел не найден" } };
  }

  let template: {
    id: number;
    contentTemplate: string | null;
    numberPrefix: string | null;
    isNumbered: boolean | null;
  } | null = null;

  if (templateId !== null) {
    const [row] = await db
      .select({
        id: documentTemplates.id,
        contentTemplate: documentTemplates.contentTemplate,
        numberPrefix: documentTemplates.numberPrefix,
        isNumbered: documentTemplates.isNumbered,
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.id, templateId))
      .limit(1);
    if (!row) return { fieldErrors: { templateId: "Шаблон не найден" } };
    template = row;
  }

  const manualContent = String(formData.get("content") ?? "").trim();
  const manualNumber = String(formData.get("documentNumber") ?? "").trim().slice(0, 50);
  const ip = await clientIp();

  /**
   * Значения полей шаблона приходят полями `fields.<имя>`. Таблицы -
   * JSON-строкой, остальное - как есть. Из них собирается тело документа
   * подстановкой в плейсхолдеры и остаётся в data_json для истории.
   */
  const fieldValues: Record<string, FieldValue> = {};
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("fields.") || typeof raw !== "string") continue;
    const name = key.slice("fields.".length);
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "[]") continue;
    // Таблица позиций уходит массивом объектов - распознаём по началу
    if (trimmed.startsWith("[")) {
      try {
        const rows = JSON.parse(trimmed);
        if (Array.isArray(rows) && rows.length > 0) {
          fieldValues[name] = rows.map((r: ItemRow) => ({
            name: String(r.name ?? ""),
            quantity: Number(r.quantity ?? 0) || 0,
            price: Number(r.price ?? 0) || 0,
            unit: String(r.unit ?? "шт."),
          }));
        }
      } catch {
        // Битую таблицу молча пропускаем: документ важнее одной строки
      }
    } else {
      fieldValues[name] = trimmed;
    }
  }

  // Тело документа: ручной текст перекрывает всё; иначе - шаблон с
  // подставленными полями; иначе - просто шаблон; иначе пусто
  let content: string | null = null;
  if (manualContent !== "") {
    content = manualContent;
  } else if (template?.contentTemplate) {
    content =
      Object.keys(fieldValues).length > 0
        ? renderTemplate(template.contentTemplate, fieldValues)
        : template.contentTemplate;
  }

  const insertDocument = () => db.transaction(async (tx) => {
    let number: string | null = manualNumber || null;

    // Номер по шаблону: префикс, год и порядковый номер за год. Выдаёт
    // атомарный счётчик по паре «префикс + год»; он же учитывает номера,
    // вписанные руками, так что совпасть с ними не может
    if (!number && template?.isNumbered !== false && template) {
      const prefix = (template.numberPrefix ?? "").trim() || "DOC-";
      number = await nextDocumentNumber(tx, prefix);
    }

    const [created] = await tx
      .insert(documents)
      .values({
        templateId,
        categoryId,
        orderId,
        userId,
        documentNumber: number,
        title,
        content,
        // Значения полей храним рядом с документом: по ним видно, из чего
        // он собран, и их можно будет показать при повторном открытии
        dataJson: Object.keys(fieldValues).length > 0 ? fieldValues : null,
        status,
        docType,
        amount,
        documentDate,
        validUntil,
        createdBy: Number(me.id),
      })
      .returning({ id: documents.id });

    await tx.insert(documentHistory).values({
      documentId: created.id,
      userId: Number(me.id),
      action: "created",
      comment: number ? `Номер ${number}` : null,
      ipAddress: ip,
    });

    return created.id;
  });

  const isTaken = (error: unknown) =>
    isUniqueViolation(error, "documents_document_number_unique");

  let documentId: number | null;
  try {
    documentId = await insertDocument();
  } catch (error) {
    if (!isTaken(error)) throw error;
    if (manualNumber) {
      // Номер вписали руками, и он занят: уникальный индекс не даёт двум
      // документам один номер
      documentId = null;
    } else {
      // Номер выдал счётчик, а чужой ручной документ успел занять его между
      // чтением максимума и вставкой. Транзакция откатилась вместе с номером;
      // второй заход видит уже занятое и берёт следующий. Ошибку у пустого
      // поля номера человеку показывать нечего
      try {
        documentId = await insertDocument();
      } catch (again) {
        if (!isTaken(again)) throw again;
        return { error: "Не удалось выдать номер документа. Нажмите «Создать» ещё раз" };
      }
    }
  }

  if (documentId === null) {
    return { fieldErrors: { documentNumber: "Документ с таким номером уже есть" } };
  }

  await audit("document.create", { type: "document", id: documentId }, { title, status });

  revalidatePath("/admin/documents");
  redirect(`/admin/documents/${documentId}`);
}

/** Смена состояния документа - с записью в его историю. */
export async function setDocumentStatus(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const me = await currentUser();
  if (!me || !(await can("documents", "edit"))) {
    return { error: "Нет прав менять документы" };
  }

  const id = Number(formData.get("documentId"));
  const raw = String(formData.get("status") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { error: "Документ не найден" };
  if (!STATUSES.includes(raw as DocStatus)) return { error: "Неизвестное состояние" };

  const [before] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!before) return { error: "Документ не найден" };

  const ip = await clientIp();

  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ status: raw as DocStatus, updatedBy: Number(me.id) })
      .where(eq(documents.id, id));

    await tx.insert(documentHistory).values({
      documentId: id,
      userId: Number(me.id),
      action: "status_changed",
      oldValue: before.status,
      newValue: raw,
      ipAddress: ip,
    });
  });

  await audit("document.status", { type: "document", id }, { status: raw });
  revalidatePath("/admin/documents");
  revalidatePath(`/admin/documents/${id}`);
  return { ok: true, message: "Состояние сохранено" };
}
