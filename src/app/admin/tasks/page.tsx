import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray, count, or } from "drizzle-orm";
import { CalendarClock, CheckSquare, Link2, User } from "lucide-react";
import { db } from "@/db";
import { tasks, taskComments, users, ordersAccounting } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import {
  taskStatus,
  taskPriority,
  readTaskItems,
  isTaskClosed,
  isOverdue,
  TASK_STATUS,
  type TaskStatus,
} from "@/lib/tasks";
import { TaskForm, type StaffOption } from "./TaskForm";
import {
  StatusControls,
  AssignControl,
  CommentForm,
  DeleteTaskButton,
} from "./TaskControls";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Задачи · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const PER_PAGE = 50;

export default async function AdminTasks({ searchParams }: PageProps<"/admin/tasks">) {
  if (!(await can("tasks", "view"))) {
    return (
      <AdminPage title="Задачи">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть задачи." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const rawStatus = String(sp.status ?? "");
  const status = rawStatus in TASK_STATUS ? (rawStatus as TaskStatus) : null;

  // По умолчанию показываем то, что в работе: закрытые задачи копятся и
  // вытесняют живые
  const openOnly = !status && sp.all !== "1";

  const page = pageFrom(sp.page);
  const where = status
    ? eq(tasks.status, status)
    : openOnly
      ? or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress"))
      : undefined;

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      taskItems: tasks.taskItems,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      assignedTo: tasks.assignedTo,
      assigneeName: users.name,
      accountingId: tasks.relatedOrderAccountingId,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .where(where)
    .orderBy(desc(tasks.updatedAt), desc(tasks.id))
    .limit(PER_PAGE)
    .offset(offsetOf(page, PER_PAGE));

  const [{ n: found }] = await db.select({ n: count() }).from(tasks).where(where);

  const [staff, byStatus, comments, linkedOrders] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.role, ["admin", "manager"]))
      .orderBy(asc(users.name)),
    db.select({ status: tasks.status, n: count() }).from(tasks).groupBy(tasks.status),
    rows.length
      ? db
          .select({
            id: taskComments.id,
            taskId: taskComments.taskId,
            comment: taskComments.comment,
            createdAt: taskComments.createdAt,
            author: users.name,
          })
          .from(taskComments)
          .leftJoin(users, eq(users.id, taskComments.userId))
          .where(
            inArray(
              taskComments.taskId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(taskComments.createdAt), asc(taskComments.id))
      : [],
    // Связь с бухгалтерской карточкой заказа: по ней ясно, к какому
    // заказу относится задача
    db
      .select({ id: ordersAccounting.id, externalOrderId: ordersAccounting.externalOrderId })
      .from(ordersAccounting),
  ]);

  const commentsOf = new Map<number, typeof comments>();
  for (const c of comments) {
    const list = commentsOf.get(c.taskId) ?? [];
    list.push(c);
    commentsOf.set(c.taskId, list);
  }

  const accountingToOrder = new Map(
    linkedOrders.map((o) => [o.id, o.externalOrderId]),
  );

  const statusCount = new Map(byStatus.map((r) => [r.status, Number(r.n)]));
  const total = byStatus.reduce((s, r) => s + Number(r.n), 0);
  const open =
    (statusCount.get("pending") ?? 0) + (statusCount.get("in_progress") ?? 0);

  const now = new Date();
  const overdue = rows.filter((r) => isOverdue(r.dueDate, r.status, now)).length;

  const canCreate = await can("tasks", "create");
  const canEdit = await can("tasks", "edit");
  const canDelete = await can("tasks", "delete");

  const staffOptions: StaffOption[] = staff;

  return (
    <AdminPage
      title="Задачи"
      subtitle={openOnly ? "Показаны незакрытые" : status ? TASK_STATUS[status].label : "Все"}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Всего задач" value={String(total)} />
        <AdminStat
          label="Незакрытых"
          value={String(open)}
          tone={open > 0 ? "brand" : "plain"}
          hint="ждут и в работе"
        />
        <AdminStat
          label="Просрочено"
          value={String(overdue)}
          tone={overdue > 0 ? "warn" : "plain"}
          hint="среди показанных"
        />
        <AdminStat label="Сделано" value={String(statusCount.get("completed") ?? 0)} />
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        <Chip href="/admin/tasks" active={openOnly}>
          Незакрытые · {open}
        </Chip>
        {(Object.keys(TASK_STATUS) as TaskStatus[]).map((key) => (
          <Chip key={key} href={`/admin/tasks?status=${key}`} active={status === key}>
            {TASK_STATUS[key].label} · {statusCount.get(key) ?? 0}
          </Chip>
        ))}
        <Chip href="/admin/tasks?all=1" active={!openOnly && !status}>
          Все · {total}
        </Chip>
      </nav>

      {canCreate && (
        <div className="mt-5">
          <TaskForm staff={staffOptions} />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty
            title="Задач нет"
            text={openOnly ? "Незакрытых задач не осталось." : undefined}
          />
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.map((t) => {
            const st = taskStatus(t.status);
            const pr = taskPriority(t.priority);
            const items = readTaskItems(t.taskItems);
            const own = commentsOf.get(t.id) ?? [];
            const late = isOverdue(t.dueDate, t.status, now);
            const orderId = t.accountingId
              ? accountingToOrder.get(t.accountingId)
              : null;

            return (
              <li
                key={t.id}
                className={cn(
                  "rounded-xl border border-ink/10 bg-bone px-5 py-4",
                  isTaskClosed(t.status) && "opacity-70",
                  late && "border-warn/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                  <div className="min-w-64 flex-1">
                    <span className="flex flex-wrap items-center gap-2.5">
                      <span className="text-ink">{t.title}</span>
                      {t.priority !== "medium" && (
                        <span className={cn("text-xs", pr.className)}>{pr.label}</span>
                      )}
                    </span>

                    {t.description && (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink/60">
                        {t.description}
                      </p>
                    )}

                    {items.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {items.map((item, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-ink/70"
                          >
                            <CheckSquare
                              className="mt-0.5 size-3.5 shrink-0 text-ink/25"
                              aria-hidden
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/45">
                      {t.dueDate && (
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            late && "text-warn",
                          )}
                        >
                          <CalendarClock className="size-3" aria-hidden />
                          срок {dt.format(t.dueDate)}
                          {late && " - просрочен"}
                        </span>
                      )}
                      {t.assigneeName ? (
                        <span className="flex items-center gap-1">
                          <User className="size-3" aria-hidden />
                          {t.assigneeName}
                        </span>
                      ) : null}
                      {orderId && (
                        <Link
                          href={`/admin/external-orders/${orderId}`}
                          className="flex items-center gap-1 hover:text-brand"
                        >
                          <Link2 className="size-3" aria-hidden />
                          заказ {orderId}
                        </Link>
                      )}
                      {t.createdAt && <span>создана {dt.format(t.createdAt)}</span>}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                </div>

                {own.length > 0 && (
                  <ol className="mt-3 flex flex-col gap-2 border-t border-ink/8 pt-3">
                    {own.map((c) => (
                      <li key={c.id} className="border-l-2 border-ink/12 pl-3 text-sm">
                        <span className="whitespace-pre-line text-ink/75">
                          {c.comment}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-ink/40">
                          {c.author ?? "-"}
                          {c.createdAt && ` · ${dtTime.format(c.createdAt)}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {canEdit && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink/8 pt-3">
                    <StatusControls taskId={t.id} status={t.status} />
                    <AssignControl
                      taskId={t.id}
                      assignedTo={t.assignedTo}
                      staff={staffOptions}
                    />
                    <CommentForm taskId={t.id} />
                    {canDelete && <DeleteTaskButton taskId={t.id} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AdminPager page={page} perPage={PER_PAGE} total={Number(found)} basePath="/admin/tasks" params={sp} />
    </AdminPage>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3.5 py-1.5 text-xs",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-ink/12 text-ink/60 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
