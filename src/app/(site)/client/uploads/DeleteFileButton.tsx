"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { deleteClientFile, type ActionState } from "@/app/actions/client";

const initial: ActionState = { ok: false };

/**
 * Удаление файла. Спрашиваем подтверждение: макет, удалённый по
 * промаху, клиенту придётся искать и загружать заново. Принятый в работу
 * файл сервер удалить и так не даст - и скажет об этом.
 */
export function DeleteFileButton({ fileId }: { fileId: number }) {
  const [state, action, pending] = useActionState(deleteClientFile, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="fileId" value={fileId} />
      <ConfirmButton
        title="Удалить файл?"
        text="Файл пропадёт из списка, и загружать его придётся заново."
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-ink/40 transition-colors hover:text-danger disabled:opacity-50"
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
