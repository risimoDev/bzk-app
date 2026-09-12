"use client";

import { useActionState } from "react";
import { Check, Link2, TriangleAlert } from "lucide-react";
import {
  archiveCounterparty,
  linkCounterpartyToUser,
  type CounterpartyState,
} from "@/app/actions/counterparties";
import { cn } from "@/lib/cn";

const initial: CounterpartyState = {};

export type AccountOption = { id: number; name: string; email: string };

/**
 * Привязка контрагента к аккаунту на сайте.
 *
 * Список аккаунтов короткий (клиентов с регистрацией единицы), поэтому
 * обычный select, а не поиск с подсказками.
 */
export function LinkAccountForm({
  id,
  current,
  accounts,
}: {
  id: number;
  current: number | null;
  accounts: AccountOption[];
}) {
  const [state, action, pending] = useActionState(linkCounterpartyToUser, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <label className="flex flex-col gap-1.5">
        <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
          АККАУНТ НА САЙТЕ
        </span>
        <select
          name="userId"
          // key заставляет React пересоздать поле после сохранения:
          // у уже существующего узла defaultValue ничего не меняет, и
          // список показывал бы прежнее значение
          key={String(current)}
          defaultValue={current ? String(current) : ""}
          className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
        >
          <option value="">Не привязан</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.email}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
      >
        <Link2 className="size-3.5" aria-hidden />
        {pending ? "СОХРАНЯЮ…" : "ПРИВЯЗАТЬ"}
      </button>

      {(state.message || state.error) && (
        <span
          className={cn(
            "flex items-start gap-2 text-xs",
            state.ok ? "text-ok" : "text-danger",
          )}
          role="status"
        >
          {state.ok ? (
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}

/** Архив вместо удаления: за контрагентом заказы и деньги. */
export function ArchiveButton({ id, archived }: { id: number; archived: boolean }) {
  const [state, action, pending] = useActionState(archiveCounterparty, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        {archived ? "ВЕРНУТЬ В РАБОТУ" : "УБРАТЬ В АРХИВ"}
      </button>
      {(state.message || state.error) && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}
