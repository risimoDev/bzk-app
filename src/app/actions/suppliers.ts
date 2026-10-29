"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { externalOrderItems, purchaseOrders, suppliers } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { rejectOverlong } from "@/lib/text-limits";

export type SupplierState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const DENIED: SupplierState = { error: "Нет прав менять справочник подрядчиков" };

const schema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название").max(255),
  contactPerson: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.literal(""), z.email("Похоже, адрес с опечаткой")]).optional(),
  website: z.string().trim().max(255).optional(),
  address: z.string().trim().max(1000).optional(),
  paymentTerms: z.string().trim().max(1000).optional(),
  deliveryTerms: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.coerce.boolean(),
});

/**
 * Подрядчик - он же поставщик.
 *
 * Один справочник на два дела: у него закупают материалы и ему же
 * перезаказывают позиции заказа. Разводить их в две таблицы значило бы
 * заводить «Резон» дважды.
 */
export async function saveSupplier(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : Number(rawId);
  const isNew = id === null;

  if (!(await can("materials", isNew ? "create" : "edit"))) return DENIED;
  if (!isNew && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Подрядчик не найден" };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    contactPerson: formData.get("contactPerson"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    website: formData.get("website"),
    address: formData.get("address"),
    paymentTerms: formData.get("paymentTerms"),
    deliveryTerms: formData.get("deliveryTerms"),
    notes: formData.get("notes"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const v = parsed.data;

  // В перенесённом справочнике «Типография Здравствуй» уже лежит дважды -
  // повторять эту историю незачем
  const [twin] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(
        eq(sql`lower(${suppliers.name})`, v.name.toLowerCase()),
        isNew ? sql`true` : ne(suppliers.id, id),
      ),
    )
    .limit(1);
  if (twin) {
    return { fieldErrors: { name: `Такой подрядчик уже есть (№ ${twin.id})` } };
  }

  const values = {
    name: v.name,
    contactPerson: v.contactPerson || null,
    phone: v.phone || null,
    email: v.email || null,
    website: v.website || null,
    address: v.address || null,
    paymentTerms: v.paymentTerms || null,
    deliveryTerms: v.deliveryTerms || null,
    notes: v.notes || null,
    isActive: v.isActive,
  };

  if (isNew) {
    const [created] = await db
      .insert(suppliers)
      .values(values)
      .returning({ id: suppliers.id });
    await audit("supplier.create", { type: "supplier", id: created.id }, { name: v.name });
    revalidatePath("/admin/suppliers");
    redirect(`/admin/suppliers/${created.id}`);
  }

  const updated = await db
    .update(suppliers)
    .set(values)
    .where(eq(suppliers.id, id))
    .returning({ id: suppliers.id });
  if (updated.length === 0) return { error: "Подрядчик не найден" };

  await audit("supplier.update", { type: "supplier", id }, { name: v.name });
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${id}`);
  return { ok: true, message: "Сохранено" };
}

/**
 * Удаление подрядчика.
 *
 * Только если за ним ничего не числится: закупки ссылаются на него с
 * `onDelete: restrict`, а позиции заказов - с `set null`, и молча
 * потерять, кому ушёл перезаказ, нельзя.
 */
export async function deleteSupplier(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  if (!(await can("materials", "delete"))) {
    return { error: "Удалять подрядчиков может только администратор" };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Подрядчик не найден" };

  const [{ purchases }] = await db
    .select({ purchases: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));

  const [{ items }] = await db
    .select({ items: sql<number>`count(*)::int` })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.supplierId, id));

  if (purchases > 0 || items > 0) {
    return {
      error:
        `За подрядчиком закупок: ${purchases}, перезаказанных позиций: ${items}. ` +
        `Удалять нельзя - выключите его вместо этого.`,
    };
  }

  await db.delete(suppliers).where(eq(suppliers.id, id));
  await audit("supplier.delete", { type: "supplier", id });

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}
