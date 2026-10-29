/**
 * Роли сотрудников. Клиент (`user`) в админку не входит, поэтому быть
 * исполнителем задачи или ответственным за лид он не может.
 *
 * Список один на весь код: раньше `["admin", "manager"]` был вписан в
 * каждый выпадающий список и в проверки по отдельности, и добавление роли
 * пришлось бы искать по всему проекту.
 */
export const STAFF_ROLES = ["admin", "manager"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === "admin" || role === "manager";
}
