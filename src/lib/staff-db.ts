import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { STAFF_ROLES } from "@/lib/staff";

/**
 * Действующие сотрудники для выпадающих списков (исполнитель, ответственный).
 * Заблокированный человек в списке не нужен: задача на него уйдёт в никуда.
 */
export async function staffOptions() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(inArray(users.role, [...STAFF_ROLES]), eq(users.isBlocked, false)))
    .orderBy(asc(users.name));
}

/**
 * Сотрудник ли пользователь с этим id и не заблокирован ли он.
 *
 * Исполнитель и ответственный приходят из формы как число: без проверки
 * роли туда можно было вписать id клиента, и задача оказалась бы в его
 * кабинете (а его имя - в рабочих списках).
 */
export async function isActiveStaff(userId: number) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        inArray(users.role, [...STAFF_ROLES]),
        eq(users.isBlocked, false),
      ),
    )
    .limit(1);
  return Boolean(row);
}
