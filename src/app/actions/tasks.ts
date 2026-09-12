"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskComments, users } from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { TASK_STATUS, TASK_PRIORITY, type TaskStatus, type TaskPriority } from "@/lib/tasks";

export type TaskState = { ok: boolean; message?: string };

const DENIED: TaskState = { ok: false, message: "Нет прав на задачи" };

export async function createTask(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const user = await currentUser();
  if (!user || !(await can("tasks", "create"))) return DENIED;

  const title = String(formData.get("title") ?? "").trim().slice(0, 255);
  const description = String(formData.get("description") ?? "").trim();
  const rawPriority = String(formData.get("priority") ?? "medium");
  const priority = (rawPriority in TASK_PRIORITY ? rawPriority : "medium") as TaskPriority;

  const rawAssignee = String(formData.get("assignedTo") ?? "").trim();
  const assignedTo = rawAssignee === "" ? null : Number(rawAssignee);

  const rawDue = String(formData.get("dueDate") ?? "").trim();

  // Пункты приходят несколькими полями с одним именем - собираем в список
  const items = formData
    .getAll("items")
    .map((v) => String(v).trim())
    .filter((v) => v !== "")
    .slice(0, 50);

  if (title === "") return { ok: false, message: "Впишите название задачи" };
  if (description === "" && items.length === 0) {
    return { ok: false, message: "Опишите задачу или добавьте хотя бы один пункт" };
  }

  if (assignedTo !== null) {
    if (!Number.isInteger(assignedTo)) return { ok: false, message: "Исполнитель не найден" };
    const [staff] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, assignedTo))
      .limit(1);
    if (!staff) return { ok: false, message: "Исполнитель не найден" };
  }

  if (rawDue !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(rawDue)) {
    return { ok: false, message: "Проверьте срок" };
  }

  // Срок - календарный день; ставим полдень по местному, чтобы дата не
  // съехала при любом пересчёте часового пояса
  const dueDate = rawDue === "" ? null : new Date(`${rawDue}T12:00:00`);

  await db.insert(tasks).values({
    title,
    description: description || null,
    taskItems: items.length > 0 ? items : null,
    assignedTo,
    createdBy: Number(user.id),
    priority,
    dueDate,
  });

  revalidatePath("/admin/tasks");
  return { ok: true, message: "Задача создана" };
}

export async function setTaskStatus(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  if (!(await can("tasks", "edit"))) return DENIED;

  const taskId = Number(formData.get("taskId"));
  const raw = String(formData.get("status") ?? "");

  if (!Number.isInteger(taskId)) return { ok: false, message: "Задача не найдена" };
  if (!(raw in TASK_STATUS)) return { ok: false, message: "Неизвестный статус" };

  const updated = await db
    .update(tasks)
    .set({ status: raw as TaskStatus, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, message: "Задача не найдена" };

  revalidatePath("/admin/tasks");
  return { ok: true, message: TASK_STATUS[raw as TaskStatus].label };
}

export async function assignTask(_prev: TaskState, formData: FormData): Promise<TaskState> {
  if (!(await can("tasks", "edit"))) return DENIED;

  const taskId = Number(formData.get("taskId"));
  const raw = String(formData.get("assignedTo") ?? "").trim();
  const assignedTo = raw === "" ? null : Number(raw);

  if (!Number.isInteger(taskId)) return { ok: false, message: "Задача не найдена" };

  if (assignedTo !== null) {
    if (!Number.isInteger(assignedTo)) return { ok: false, message: "Исполнитель не найден" };
    const [staff] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, assignedTo))
      .limit(1);
    if (!staff) return { ok: false, message: "Исполнитель не найден" };
  }

  const updated = await db
    .update(tasks)
    .set({ assignedTo, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, message: "Задача не найдена" };

  revalidatePath("/admin/tasks");
  return { ok: true, message: assignedTo ? "Исполнитель назначен" : "Исполнитель снят" };
}

export async function commentTask(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const user = await currentUser();
  if (!user || !(await can("tasks", "edit"))) return DENIED;

  const taskId = Number(formData.get("taskId"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!Number.isInteger(taskId)) return { ok: false, message: "Задача не найдена" };
  if (comment === "") return { ok: false, message: "Комментарий пустой" };

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return { ok: false, message: "Задача не найдена" };

  await db.transaction(async (tx) => {
    await tx.insert(taskComments).values({ taskId, userId: Number(user.id), comment });
    // Двигаем отметку изменения: по ней задачи сортируются в списке
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
  });

  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function deleteTask(_prev: TaskState, formData: FormData): Promise<TaskState> {
  if (!(await can("tasks", "delete"))) {
    return { ok: false, message: "Удалять задачи может администратор" };
  }

  const taskId = Number(formData.get("taskId"));
  if (!Number.isInteger(taskId)) return { ok: false, message: "Задача не найдена" };

  const removed = await db
    .delete(tasks)
    .where(eq(tasks.id, taskId))
    .returning({ id: tasks.id });

  if (removed.length === 0) return { ok: false, message: "Задача не найдена" };

  revalidatePath("/admin/tasks");
  return { ok: true, message: "Задача удалена" };
}
