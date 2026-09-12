"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { documentCategories, documentTemplates } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { parseFieldsSchema } from "@/lib/document-templates";

export type TemplateState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Префикс номера: буквы, цифры и разделители - он печатается в документе. */
const PREFIX = /^[\p{L}\d._\-/]*$/u;

/**
 * Сохранение шаблона документа: без `id` заводится новый.
 *
 * Тело шаблона - HTML, и сохраняется как есть: при показе документ всё
 * равно проходит через белый список тегов (`safeDocumentHtml`), так что
 * скрипт из шаблона до страницы не доберётся.
 */
export async function saveTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("documents", isNew ? "create" : "edit"))) {
    return { error: "У вашей роли нет права менять шаблоны документов" };
  }
  if (!isNew && (!Number.isInteger(id) || id <= 0)) return { error: "Шаблон не найден" };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryRaw = String(formData.get("categoryId") ?? "").trim();
  const numberPrefix = String(formData.get("numberPrefix") ?? "").trim();
  const isNumbered = formData.get("isNumbered") === "on";
  const isActive = formData.get("isActive") === "on";
  const content = String(formData.get("contentTemplate") ?? "");
  const fieldsRaw = String(formData.get("fieldsSchema") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Назовите шаблон";
  if (name.length > 150) fieldErrors.name = "Не длиннее 150 знаков";
  if (description.length > 1000) fieldErrors.description = "Не длиннее 1000 знаков";
  if (numberPrefix.length > 20 || !PREFIX.test(numberPrefix)) {
    fieldErrors.numberPrefix = "До 20 знаков: буквы, цифры, точка, дефис";
  }
  if (content.length > 500_000) fieldErrors.contentTemplate = "Шаблон слишком большой";

  const fields = parseFieldsSchema(fieldsRaw);
  if (!fields.ok) fieldErrors.fieldsSchema = fields.error;

  let categoryId: number | null = null;
  if (categoryRaw !== "") {
    categoryId = Number(categoryRaw);
    const [exists] = Number.isInteger(categoryId)
      ? await db
          .select({ id: documentCategories.id })
          .from(documentCategories)
          .where(eq(documentCategories.id, categoryId))
          .limit(1)
      : [];
    if (!exists) fieldErrors.categoryId = "Раздел не найден";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const values = {
    name,
    description: description || null,
    categoryId,
    numberPrefix,
    isNumbered,
    isActive,
    contentTemplate: content.trim() === "" ? null : content,
    fieldsSchema: fields.ok ? fields.value : null,
  };

  let savedId = id;
  try {
    if (isNew) {
      const [created] = await db
        .insert(documentTemplates)
        .values({
          ...values,
          // Системное имя обязательное и уникальное, но наружу не видно.
          // Придумывать его человеку незачем
          slug: `tpl-${Date.now().toString(36)}`,
        })
        .returning({ id: documentTemplates.id });
      savedId = created.id;
    } else {
      await db.update(documentTemplates).set(values).where(eq(documentTemplates.id, id));
    }
  } catch {
    return { error: "Не удалось сохранить. Попробуйте ещё раз" };
  }

  await audit("document_template.save", { type: "document_template", id: savedId }, { name, isActive });

  revalidatePath("/admin/documents/templates");
  revalidatePath(`/admin/documents/templates/${savedId}`);
  revalidatePath("/admin/documents/new");

  if (isNew) redirect(`/admin/documents/templates/${savedId}`);

  return { ok: true, message: "Шаблон сохранён" };
}
