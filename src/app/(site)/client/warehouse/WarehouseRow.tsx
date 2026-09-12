"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { deleteWarehouseItem, type ActionState } from "@/app/actions/client";
import { WarehouseForm, type WarehouseDraft } from "./WarehouseForm";

const initial: ActionState = { ok: false };

/**
 * Управление одной позицией склада.
 *
 * Форма правки раскрывается на месте строки - так видно, что именно
 * меняешь, и не нужен ни отдельный экран, ни диалог поверх списка.
 */
export function WarehouseRow({
  item,
  locked,
}: {
  item: WarehouseDraft;
  locked: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(deleteWarehouseItem, initial);

  if (locked) {
    return (
      <p className="mt-3 text-xs text-ink/40">
        Позиция уже в работе - изменения вносит менеджер.
      </p>
    );
  }

  if (editing) {
    return (
      <div className="mt-4">
        <WarehouseForm editing={item} />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 text-xs text-ink/45 hover:text-ink"
        >
          Отменить правку
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-ink/45 transition-colors hover:text-brand"
      >
        <Pencil className="size-3.5" aria-hidden />
        Изменить
      </button>

      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="itemId" value={item.id} />
        <ConfirmButton
          title={`Удалить «${item.name}»?`}
          text="Позиция и её остаток пропадут из вашего склада."
          disabled={pending}
          className="flex items-center gap-1.5 text-xs text-ink/45 transition-colors hover:text-danger disabled:opacity-50"
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
    </div>
  );
}
