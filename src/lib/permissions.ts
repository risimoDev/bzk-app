import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";
import { currentUser } from "@/auth";

export type Module =
  | "orders"
  | "products"
  | "users"
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
 * Права ролей лежат в таблице role_permissions - перенесены из старого
 * сайта как есть. Набор меняется через админку, поэтому он в базе,
 * а не захардкожен здесь.
 */
export async function can(module: Module, action: Action = "view") {
  const user = await currentUser();
  if (!user) return false;

  // Клиент в админку не заходит вовсе, незачем дёргать базу
  if (user.role === "user") return false;

  const [row] = await db
    .select({ id: rolePermissions.id })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.role, user.role),
        eq(rolePermissions.module, module),
        eq(rolePermissions.action, action),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/** Пускать в админку вообще: только сотрудников. */
export async function staffOnly() {
  const user = await currentUser();
  return user && user.role !== "user" ? user : null;
}

/**
 * Все права роли разом - одним запросом.
 *
 * Меню админки проверяет два десятка разделов сразу, и звать `can()` на
 * каждый значило бы два десятка запросов на отрисовку страницы.
 */
export async function permissionsOf(role: string) {
  const rows = await db
    .select({ module: rolePermissions.module, action: rolePermissions.action })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role));

  return new Set(rows.map((r) => `${r.module}.${r.action}`));
}

/** Разделы, которые роли вообще можно показывать. */
export async function visibleModules(role: string) {
  const all = await permissionsOf(role);
  return new Set(
    [...all].filter((k) => k.endsWith(".view")).map((k) => k.slice(0, -".view".length)),
  );
}
