"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { can } from "@/lib/permissions";
import { COMPANY_FIELDS, validateCompany, type Company, type CompanyField } from "@/lib/company";

export type CompanyFormState = {
  ok: boolean;
  message?: string;
  errors?: Partial<Record<CompanyField, string>>;
};

/**
 * Сохранение реквизитов продавца.
 *
 * Реквизиты лежат в таблице settings парами ключ-значение, поэтому пишем
 * их одним upsert по уникальному имени: так не нужно ни читать текущее
 * состояние, ни различать «создать» и «обновить».
 */
export async function saveCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "У вашей роли нет права менять настройки" };
  }

  const keys = Object.keys(COMPANY_FIELDS) as CompanyField[];
  const values = {} as Company;

  for (const key of keys) {
    // Поле settings.value - varchar(255); режем здесь, а не в базе,
    // чтобы не получить обрыв реквизита посреди адреса без предупреждения
    values[key] = String(formData.get(key) ?? "").trim().slice(0, 255);
  }

  const errors = validateCompany(values);
  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Проверьте выделенные поля", errors };
  }

  const rows = keys.map((name) => ({ name, value: values[name] }));

  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({
      target: settings.name,
      set: { value: sql`excluded.value` },
    });

  revalidatePath("/admin/settings/company");
  return { ok: true, message: "Реквизиты сохранены" };
}
