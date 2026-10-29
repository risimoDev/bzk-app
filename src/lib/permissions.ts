import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";
import { currentUser } from "@/auth";

export type Module =
  | "orders"
  | "products"
  | "users"
  | "crm"
  | "counterparties"
  | "finance"
  | "materials"
  | "documents"
  | "tasks"
  | "kanban"
  | "messaging"
  | "calculator"
  | "pricelist"
  | "settings";

export type Action = "view" | "create" | "edit" | "delete" | "manage";

/**
 * Текущий пользователь, один раз на запрос.
 *
 * Страница админки зовёт `can()` несколько раз (проверка раздела, кнопки
 * правки, удаления), а каждый `currentUser()` - это чтение сессии и
 * запрос к базе. `cache` из React живёт ровно один запрос и не делится
 * между пользователями, поэтому устаревшей сессии не будет.
 */
const sessionUser = cache(() => currentUser());

/**
 * Все права роли разом - одним запросом на запрос страницы.
 *
 * Меню админки проверяет два десятка разделов сразу, а страница - ещё
 * несколько действий: раньше каждый `can()` стоил запроса в таблицу прав
 * плюс чтение сессии. Теперь права роли читаются один раз и дальше
 * проверяются по множеству в памяти.
 */
export const permissionsOf = cache(async (role: string) => {
  const rows = await db
    .select({ module: rolePermissions.module, action: rolePermissions.action })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role));

  return new Set(rows.map((r) => `${r.module}.${r.action}`));
});

/**
 * Права ролей лежат в таблице role_permissions - перенесены из старого
 * сайта как есть. Набор меняется через админку, поэтому он в базе,
 * а не захардкожен здесь.
 */
export async function can(module: Module, action: Action = "view") {
  const user = await sessionUser();
  if (!user) return false;

  // Клиент в админку не заходит вовсе, незачем дёргать базу
  if (user.role === "user") return false;

  return (await permissionsOf(user.role)).has(`${module}.${action}`);
}

/** Пускать в админку вообще: только сотрудников. */
export async function staffOnly() {
  const user = await sessionUser();
  return user && user.role !== "user" ? user : null;
}

/** Разделы, которые роли вообще можно показывать. */
export async function visibleModules(role: string) {
  const all = await permissionsOf(role);
  return new Set(
    [...all].filter((k) => k.endsWith(".view")).map((k) => k.slice(0, -".view".length)),
  );
}
