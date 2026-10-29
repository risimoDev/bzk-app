"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, externalOrders, users } from "@/db/schema";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { phoneDigits } from "@/lib/counterparties";

export type CounterpartyState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Созданный контрагент - форме заказа он нужен, чтобы сразу его выбрать. */
  createdId?: number;
};

const DENIED: CounterpartyState = { error: "Нет прав на изменение контрагентов" };

const schema = z.object({
  name: z.string().trim().min(2, "Слишком короткое имя").max(255),
  companyName: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.literal(""), z.email("Похоже, адрес с опечаткой")]).optional(),
  inn: z
    .union([z.literal(""), z.string().regex(/^\d{10}$|^\d{12}$/, "ИНН - 10 или 12 цифр")])
    .optional(),
  address: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function collectErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Завести контрагента или поправить существующего.
 *
 * Одно действие на оба случая: поля те же, а разводить два почти
 * одинаковых куска ради `id` смысла нет.
 */
export async function saveCounterparty(
  _prev: CounterpartyState,
  formData: FormData,
): Promise<CounterpartyState> {
  if (!(await can("counterparties", "edit"))) return DENIED;

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId ? Number(rawId) : null;
  if (id !== null && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Контрагент не найден" };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    inn: formData.get("inn"),
    address: formData.get("address"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) return { fieldErrors: collectErrors(parsed.error) };

  const v = parsed.data;
  const values = {
    name: v.name,
    companyName: v.companyName || null,
    phone: v.phone || null,
    email: v.email || null,
    inn: v.inn || null,
    address: v.address || null,
    notes: v.notes || null,
  };

  // Один и тот же заказчик, заведённый дважды, - ровно та беда, ради
  // которой заводилась таблица. Ищем по цифрам телефона, а не по строке:
  // «+7 (342)…» и «8342…» - один номер
  const digits = phoneDigits(v.phone);
  if (digits) {
    const [twin] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(
        and(
          sql`regexp_replace(${clients.phone}, '\\D', '', 'g') like ${"%" + digits.slice(-10)}`,
          id === null ? sql`true` : ne(clients.id, id),
        ),
      )
      .limit(1);

    if (twin) {
      return {
        fieldErrors: {
          phone: `Этот телефон уже у контрагента «${twin.name}» (№ ${twin.id})`,
        },
      };
    }
  }

  if (id === null) {
    const [created] = await db.insert(clients).values(values).returning({ id: clients.id });
    await audit("counterparty.create", { type: "client", id: created.id }, { name: v.name });
    revalidatePath("/admin/counterparties");
    return { ok: true, message: "Контрагент заведён", createdId: created.id };
  }

  const updated = await db
    .update(clients)
    .set(values)
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  if (updated.length === 0) return { error: "Контрагент не найден" };

  await audit("counterparty.update", { type: "client", id }, { name: v.name });
  revalidatePath("/admin/counterparties");
  revalidatePath(`/admin/counterparties/${id}`);
  return { ok: true, message: "Сохранено" };
}

/**
 * Привязать контрагента к аккаунту на сайте.
 *
 * Связь ставится на контрагента целиком: все его заказы, прошлые и
 * будущие, появляются в кабинете одним действием. Прицеплять каждый
 * заказ по отдельности заказчик не должен.
 */
export async function linkCounterpartyToUser(
  _prev: CounterpartyState,
  formData: FormData,
): Promise<CounterpartyState> {
  if (!(await can("counterparties", "edit"))) return DENIED;

  const id = Number(formData.get("id"));
  const rawUser = String(formData.get("userId") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { error: "Контрагент не найден" };

  // Пустое значение - отвязка: аккаунт заводили не тому человеку
  if (rawUser === "") {
    await db.update(clients).set({ userId: null }).where(eq(clients.id, id));
    await audit("counterparty.unlink", { type: "client", id });
    revalidatePath(`/admin/counterparties/${id}`);
    return { ok: true, message: "Аккаунт отвязан" };
  }

  const userId = Number(rawUser);
  if (!Number.isInteger(userId) || userId <= 0) return { error: "Аккаунт не найден" };

  const [account] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return { error: "Аккаунт не найден" };

  // Два контрагента на один аккаунт - это два списка заказов в одном
  // кабинете и путаница в том, кому писать. Пусть сначала отвяжут
  const [busy] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.userId, userId), ne(clients.id, id)))
    .limit(1);
  if (busy) {
    return { error: `Аккаунт уже привязан к контрагенту «${busy.name}» (№ ${busy.id})` };
  }

  const updated = await db
    .update(clients)
    .set({ userId })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });
  if (updated.length === 0) return { error: "Контрагент не найден" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(externalOrders)
    .where(eq(externalOrders.clientId, id));

  await audit("counterparty.link", { type: "client", id }, { userId, orders: n });
  revalidatePath(`/admin/counterparties/${id}`);
  revalidatePath("/client/orders");

  return {
    ok: true,
    message:
      n > 0
        ? `Привязано к ${account.name} - в кабинете появится заказов: ${n}`
        : `Привязано к ${account.name}`,
  };
}

/**
 * Прицепить осиротевший заказ к контрагенту.
 *
 * У 75 заказов, перенесённых со старого сайта, контрагента нет вовсе -
 * там было только имя строкой. Разбирать их приходится руками.
 */
export async function attachOrderToCounterparty(
  _prev: CounterpartyState,
  formData: FormData,
): Promise<CounterpartyState> {
  if (!(await can("orders", "edit"))) {
    return { error: "Нет прав на изменение заказов" };
  }

  const orderId = Number(formData.get("orderId"));
  const rawClient = String(formData.get("clientId") ?? "").trim();
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "Заказ не найден" };

  const clientId = rawClient === "" ? null : Number(rawClient);
  if (clientId !== null && (!Number.isInteger(clientId) || clientId <= 0)) {
    return { error: "Контрагент не найден" };
  }

  if (clientId !== null) {
    const [exists] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!exists) return { error: "Контрагент не найден" };
  }

  const updated = await db
    .update(externalOrders)
    .set({ clientId })
    .where(eq(externalOrders.id, orderId))
    .returning({ id: externalOrders.id });
  if (updated.length === 0) return { error: "Заказ не найден" };

  await audit("order.attach_counterparty", { type: "external_order", id: orderId }, { clientId });
  revalidatePath(`/admin/external-orders/${orderId}`);
  if (clientId) revalidatePath(`/admin/counterparties/${clientId}`);

  return { ok: true, message: clientId ? "Заказ прицеплен" : "Контрагент отцеплен" };
}

/**
 * Убрать контрагента из выбора, не удаляя.
 *
 * Удалять нельзя: за ним заказы, а с ними и деньги. Архив просто прячет
 * его из подсказок при создании заказа.
 */
export async function archiveCounterparty(
  _prev: CounterpartyState,
  formData: FormData,
): Promise<CounterpartyState> {
  if (!(await can("counterparties", "edit"))) return DENIED;

  const id = Number(formData.get("id"));
  const archived = String(formData.get("archived") ?? "") === "1";
  if (!Number.isInteger(id) || id <= 0) return { error: "Контрагент не найден" };

  const updated = await db
    .update(clients)
    .set({ isArchived: archived })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });
  if (updated.length === 0) return { error: "Контрагент не найден" };

  await audit(archived ? "counterparty.archive" : "counterparty.restore", {
    type: "client",
    id,
  });
  revalidatePath("/admin/counterparties");
  revalidatePath(`/admin/counterparties/${id}`);
  return { ok: true, message: archived ? "Убран в архив" : "Возвращён в работу" };
}
