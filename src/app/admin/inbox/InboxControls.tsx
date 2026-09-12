"use client";

import { useActionState, useState } from "react";
import { Check, MailOpen, Trash2, Undo2, X } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  setMessageStatus,
  deleteMessage,
  setReviewStatus,
  type InboxState,
} from "@/app/actions/inbox";
import { cn } from "@/lib/cn";

const initial: InboxState = { ok: false };

/** Прочитано / вернуть в новые. */
export function MessageStatusButton({
  messageId,
  status,
}: {
  messageId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setMessageStatus, initial);
  const isRead = status === "read";

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="status" value={isRead ? "new" : "read"} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/45 hover:text-brand disabled:opacity-50"
      >
        {isRead ? (
          <Undo2 className="size-3.5" aria-hidden />
        ) : (
          <MailOpen className="size-3.5" aria-hidden />
        )}
        {isRead ? "Вернуть в новые" : "Прочитано"}
      </button>
      {state.message && !state.ok && (
        <span className="text-xs text-danger" role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function DeleteMessageButton({ messageId }: { messageId: number }) {
  const [state, action, pending] = useActionState(deleteMessage, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <ConfirmButton
        title="Удалить сообщение?"
        text="Сообщение с сайта пропадёт насовсем."
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

/**
 * Публикация отзыва. Отклонение требует объяснения, поэтому у него своя
 * форма с полем - одной кнопкой тут не обойтись.
 */
export function ReviewControls({
  reviewId,
  status,
  comment,
}: {
  reviewId: number;
  status: string | null;
  comment: string;
}) {
  const [state, action, pending] = useActionState(setReviewStatus, initial);
  const [rejecting, setRejecting] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />

      {rejecting ? (
        <>
          <input
            name="comment"
            defaultValue={comment}
            required
            maxLength={500}
            placeholder="Почему отзыв отклонён"
            className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="status"
              value="rejected"
              disabled={pending}
              className="rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider text-danger ring-1 ring-danger/40 hover:bg-danger/10 disabled:opacity-60"
            >
              ОТКЛОНИТЬ
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="flex items-center gap-1 text-xs text-ink/45 hover:text-ink"
            >
              <X className="size-3" aria-hidden />
              Отмена
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="submit"
            name="status"
            value="approved"
            disabled={pending || status === "approved"}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              status === "approved"
                ? "bg-ok/15 text-ok"
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
            )}
          >
            <Check className="size-3" aria-hidden />
            ОПУБЛИКОВАТЬ
          </button>

          <button
            type="button"
            onClick={() => setRejecting(true)}
            className={cn(
              "rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              status === "rejected"
                ? "bg-danger/12 text-danger"
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
            )}
          >
            ОТКЛОНИТЬ
          </button>

          {status !== "pending" && (
            <button
              type="submit"
              name="status"
              value="pending"
              disabled={pending}
              className="rounded border border-ink/12 px-2.5 py-1 font-display text-[0.6rem] tracking-wider text-ink/45 hover:border-ink/30 hover:text-ink disabled:opacity-60"
            >
              ВЕРНУТЬ НА ПРОВЕРКУ
            </button>
          )}
        </div>
      )}

      {state.message && (
        <span
          className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
