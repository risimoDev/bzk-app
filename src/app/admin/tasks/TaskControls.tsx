"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, SendHorizonal, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  setTaskStatus,
  assignTask,
  commentTask,
  deleteTask,
  type TaskState,
} from "@/app/actions/tasks";
import { TASK_STATUS, type TaskStatus } from "@/lib/tasks";
import type { StaffOption } from "./TaskForm";
import { cn } from "@/lib/cn";

const initial: TaskState = { ok: false };

/** Переключатель статуса задачи. */
export function StatusControls({
  taskId,
  status,
}: {
  taskId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setTaskStatus, initial);
  const current = status ?? "pending";

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="taskId" value={taskId} />
      {(Object.keys(TASK_STATUS) as TaskStatus[]).map((key) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="submit"
            name="status"
            value={key}
            disabled={pending || active}
            className={cn(
              "rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              active
                ? TASK_STATUS[key].className
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
              pending && "opacity-60",
            )}
          >
            {TASK_STATUS[key].label}
          </button>
        );
      })}
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Быстрое назначение исполнителя - меняется прямо в списке. */
export function AssignControl({
  taskId,
  assignedTo,
  staff,
}: {
  taskId: number;
  assignedTo: number | null;
  staff: StaffOption[];
}) {
  const [state, action, pending] = useActionState(assignTask, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor={`assign-${taskId}`} className="sr-only">
        Исполнитель задачи
      </label>
      <select
        id={`assign-${taskId}`}
        name="assignedTo"
        defaultValue={assignedTo ? String(assignedTo) : ""}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border border-ink/12 bg-paper px-2 py-1 text-xs text-ink/70 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright disabled:opacity-60"
      >
        <option value="">Не назначен</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Комментарий к задаче: поле раскрывается по кнопке. */
export function CommentForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(commentTask, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Поле очищаем, но не сворачиваем: комментарии часто пишут подряд, а
  // сворачивание формы из эффекта - лишний каскад перерисовок
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-ink/45 hover:text-brand"
      >
        <MessageSquarePlus className="size-3.5" aria-hidden />
        Комментарий
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor={`comment-${taskId}`} className="sr-only">
        Комментарий к задаче
      </label>
      <textarea
        id={`comment-${taskId}`}
        name="comment"
        rows={2}
        required
        placeholder="Что сделано или что мешает"
        className="w-full resize-y rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-1.5 font-display text-[0.6rem] tracking-wider text-bone hover:bg-graphite disabled:opacity-60"
        >
          <SendHorizonal className="size-3" aria-hidden />
          {pending ? "ОТПРАВЛЯЮ…" : "ДОБАВИТЬ"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink/45 hover:text-ink"
        >
          Отмена
        </button>
        {state.message && !state.ok && (
          <span className="text-xs text-danger" role="status">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(deleteTask, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <ConfirmButton
        title="Удалить задачу?"
        text="Задача пропадёт из списка вместе с историей."
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/35 hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
        {pending ? "Удаляю…" : "Удалить"}
      </ConfirmButton>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
