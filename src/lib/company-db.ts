import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { COMPANY_FIELDS, EMPTY_COMPANY, type Company, type CompanyField } from "@/lib/company";
import { isKeyOf } from "@/lib/guards";

/**
 * Чтение реквизитов продавца из настроек.
 *
 * Вынесено отдельно от описания полей: то описание подключает клиентская
 * форма, а вместе с драйвером Postgres она бы не собралась.
 */
export async function readCompany(): Promise<Company> {
  const keys = Object.keys(COMPANY_FIELDS) as CompanyField[];
  const rows = await db
    .select({ name: settings.name, value: settings.value })
    .from(settings)
    .where(inArray(settings.name, keys));

  const out = { ...EMPTY_COMPANY };
  for (const r of rows) {
    if (isKeyOf(out, r.name)) out[r.name as CompanyField] = r.value ?? "";
  }
  return out;
}
