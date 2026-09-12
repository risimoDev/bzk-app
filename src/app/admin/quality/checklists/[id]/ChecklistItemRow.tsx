"use client";

import { useState } from "react";
import { Pencil, ShieldAlert } from "lucide-react";
import { ChecklistItemForm, DeleteItemButton, type ItemDraft } from "./ChecklistItemForm";

/** Строка пункта: показ, а по кнопке - форма правки на том же месте. */
export function ChecklistItemRow({
  item,
  checklistId,
  canEdit,
}: {
  item: ItemDraft;
  checklistId: number;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="px-5 py-4">
        <ChecklistItemForm
          checklistId={checklistId}
          editing={item}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-x-5 gap-y-2 px-5 py-3.5">
      <span className="w-8 shrink-0 font-mono text-xs text-ink/35">
        {item.sortOrder}
      </span>

      <div className="min-w-64 flex-1">
        <span className="flex items-center gap-2 text-ink">
          {item.isCritical && (
            <ShieldAlert
              className="size-3.5 shrink-0 text-danger"
              aria-label="Критический пункт"
            />
          )}
          {item.text}
        </span>
        {item.description && (
          <span className="mt-0.5 block text-xs text-ink/50">{item.description}</span>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-brand"
          >
            <Pencil className="size-3.5" aria-hidden />
            Изменить
          </button>
          <DeleteItemButton itemId={item.id} checklistId={checklistId} />
        </div>
      )}
    </li>
  );
}
