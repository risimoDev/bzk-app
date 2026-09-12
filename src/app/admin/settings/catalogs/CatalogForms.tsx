"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  deleteCategory,
  saveCategory,
  saveDocumentCategory,
  saveExpenseCategory,
  type CatalogState,
} from "@/app/actions/catalogs";
import { cn } from "@/lib/cn";
import { adminInlineInputClass } from "@/components/ui/form-classes";

const initial: CatalogState = {};

/**
 * Справочники правятся прямо в списке: строк там десяток, и отдельная
 * страница на каждую запись была бы дороже самой записи.
 */
function Status({ state }: { state: CatalogState }) {
  if (!state.message && !state.error) return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        state.ok ? "text-ok" : "text-danger",
      )}
      role="status"
    >
      {state.ok ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <TriangleAlert className="size-3.5" aria-hidden />
      )}
      {state.message ?? state.error}
    </span>
  );
}

/** Категория товара: название и всё. */
export function CategoryRow({
  value,
  canDelete,
}: {
  value?: { id: number; name: string };
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(saveCategory, initial);
  const [del, deleteAction, deleting] = useActionState(deleteCategory, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink/6 px-4 py-2.5 last:border-0">
      <form ref={formRef} action={action} className="flex flex-1 flex-wrap items-center gap-2">
        {value && <input type="hidden" name="id" value={value.id} />}
        <input
          name="name"
          defaultValue={value?.name ?? ""}
          maxLength={255}
          placeholder="Название категории"
          className={cn(inputClass, "min-w-48 flex-1", state.fieldErrors?.name && "border-danger")}
        />
        <button type="submit" disabled={pending} className={saveClass}>
          {pending ? "…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
        </button>
        {state.fieldErrors?.name && (
          <span className="text-xs text-danger">{state.fieldErrors.name}</span>
        )}
        <Status state={state} />
      </form>

      {value && canDelete && (
        <form action={deleteAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={value.id} />
          <ConfirmButton
            title={`Удалить категорию «${value.name}»?`}
            text="Категория пропадёт из справочника и из фильтра каталога."
            disabled={deleting}
            ariaLabel="Удалить категорию"
            className="rounded p-1.5 text-ink/30 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </ConfirmButton>
          {del.error && <span className="text-xs text-danger">{del.error}</span>}
        </form>
      )}
    </div>
  );
}

/** Статья расходов: название и пояснение. */
export function ExpenseCategoryRow({
  value,
}: {
  value?: { id: number; name: string; description: string | null };
}) {
  const [state, action, pending] = useActionState(saveExpenseCategory, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-center gap-2 border-b border-ink/6 px-4 py-2.5 last:border-0"
    >
      {value && <input type="hidden" name="id" value={value.id} />}
      <input
        name="name"
        defaultValue={value?.name ?? ""}
        maxLength={255}
        placeholder="Статья"
        className={cn(inputClass, "min-w-40 flex-1", state.fieldErrors?.name && "border-danger")}
      />
      <input
        name="description"
        defaultValue={value?.description ?? ""}
        maxLength={1000}
        placeholder="Что сюда относим"
        className={cn(inputClass, "min-w-48 flex-[2]")}
      />
      <button type="submit" disabled={pending} className={saveClass}>
        {pending ? "…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
      </button>
      <Status state={state} />
    </form>
  );
}

/** Раздел документов: название, порядок и включённость. */
export function DocumentCategoryRow({
  value,
}: {
  value?: { id: number; name: string; sortOrder: number | null; isActive: boolean | null };
}) {
  const [state, action, pending] = useActionState(saveDocumentCategory, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-center gap-2 border-b border-ink/6 px-4 py-2.5 last:border-0"
    >
      {value && <input type="hidden" name="id" value={value.id} />}
      <input
        name="name"
        defaultValue={value?.name ?? ""}
        maxLength={100}
        placeholder="Название раздела"
        className={cn(inputClass, "min-w-48 flex-1", state.fieldErrors?.name && "border-danger")}
      />
      <input
        name="sortOrder"
        defaultValue={value?.sortOrder ?? 0}
        inputMode="numeric"
        aria-label="Порядок"
        className={cn(inputClass, "w-20 font-mono")}
      />
      <label className="flex items-center gap-1.5 text-xs text-ink/65">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={value?.isActive ?? true}
          className="size-3.5 accent-brand"
        />
        показывать
      </label>
      <button type="submit" disabled={pending} className={saveClass}>
        {pending ? "…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
      </button>
      <Status state={state} />
    </form>
  );
}

/** Свёрнутая форма добавления - списки открывают, чтобы посмотреть. */
export function AddRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-bright"
        >
          <Plus className="size-3.5" aria-hidden />
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-ink/10 bg-paper/60">
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <span className="font-display text-[0.6rem] tracking-[0.16em] text-ink/40">
          {label.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть"
          className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

const inputClass = adminInlineInputClass;
const saveClass =
  "rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/60 hover:border-brand/40 hover:text-brand disabled:opacity-50";
