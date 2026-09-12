"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellPlus, Check, TriangleAlert, UserPlus, X } from "lucide-react";
import {
  setLeadStatus,
  logInteraction,
  createReminder,
  convertLeadToCounterparty,
  type CrmState,
} from "@/app/actions/crm";
import {
  LEAD_STATUS,
  INTERACTION_TYPE,
  hasDirection,
  type LeadStatus,
  type InteractionType,
} from "@/lib/crm";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: CrmState = { ok: false };

/**
 * Лид → контрагент → заказ.
 *
 * Одна кнопка вместо «завести заказчика руками и не забыть отметить
 * лид выигранным»: после неё сразу открывается форма нового заказа.
 */
export function ConvertLeadButton({
  leadId,
  clientId,
}: {
  leadId: number;
  clientId: number | null;
}) {
  const [state, action, pending] = useActionState(convertLeadToCounterparty, initial);

  if (clientId) {
    return (
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/counterparties/${clientId}`}
          className="flex items-center justify-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand"
        >
          <UserPlus className="size-3.5" aria-hidden />
          КАРТОЧКА КОНТРАГЕНТА
        </Link>
        <Link
          href={`/admin/external-orders/new?client=${clientId}`}
          className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
        >
          НОВЫЙ ЗАКАЗ
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
      >
        <UserPlus className="size-3.5" aria-hidden />
        {pending ? "ЗАВОЖУ…" : "ЗАВЕСТИ КОНТРАГЕНТА И ЗАКАЗ"}
      </button>
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

/**
 * Движение лида по воронке. «Проиграли» открывает поле причины: без неё
 * действие не пройдёт, и лучше сказать об этом до нажатия.
 */
export function LeadStatusControls({
  leadId,
  status,
  lossReason,
}: {
  leadId: number;
  status: string | null;
  lossReason: string;
}) {
  const [state, action, pending] = useActionState(setLeadStatus, initial);
  const [losing, setLosing] = useState(false);
  const current = status ?? "new";

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />

      {losing ? (
        <>
          <input
            name="lossReason"
            defaultValue={lossReason}
            required
            maxLength={500}
            placeholder="Почему сделка не состоялась"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="status"
              value="lost"
              disabled={pending}
              className="rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider text-danger ring-1 ring-danger/40 hover:bg-danger/10 disabled:opacity-60"
            >
              ПРОИГРАЛИ
            </button>
            <button
              type="button"
              onClick={() => setLosing(false)}
              className="flex items-center gap-1 text-xs text-ink/45 hover:text-ink"
            >
              <X className="size-3" aria-hidden />
              Отмена
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((key) => {
            const active = key === current;

            if (key === "lost") {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLosing(true)}
                  className={cn(
                    "rounded px-2.5 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
                    active
                      ? LEAD_STATUS[key].className
                      : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
                  )}
                >
                  {LEAD_STATUS[key].label}
                </button>
              );
            }

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
                    ? LEAD_STATUS[key].className
                    : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
                  pending && "opacity-60",
                )}
              >
                {LEAD_STATUS[key].label}
              </button>
            );
          })}
        </div>
      )}

      {state.message && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Запись касания: звонок, письмо, встреча или просто заметка. */
export function InteractionForm({ leadId }: { leadId: number }) {
  const [state, action, pending] = useActionState(logInteraction, initial);
  const [type, setType] = useState<InteractionType>("call");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-ink/10 bg-bone p-5"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <h2 className="font-display text-base text-ink">Записать касание</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЧТО БЫЛО</span>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as InteractionType)}
            className={inputClass}
          >
            {(Object.keys(INTERACTION_TYPE) as InteractionType[]).map((key) => (
              <option key={key} value={key}>
                {INTERACTION_TYPE[key]}
              </option>
            ))}
          </select>
        </label>

        {hasDirection(type) ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>НАПРАВЛЕНИЕ</span>
            <select name="direction" defaultValue="outgoing" className={inputClass}>
              <option value="outgoing">Исходящий</option>
              <option value="incoming">Входящий</option>
            </select>
          </label>
        ) : (
          <span />
        )}

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ДЛИТЕЛЬНОСТЬ, МИН</span>
          <input
            name="durationMinutes"
            type="number"
            min={0}
            placeholder="не обязательно"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-3">
          <span className={labelClass}>ТЕМА</span>
          <input
            name="subject"
            maxLength={255}
            placeholder="Коротко: о чём разговор"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-3">
          <span className={labelClass}>ПОДРОБНОСТИ</span>
          <textarea
            name="description"
            rows={2}
            className={cn(inputClass, "resize-y")}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-3">
          <span className={labelClass}>ЧЕМ КОНЧИЛОСЬ</span>
          <input
            name="result"
            maxLength={500}
            placeholder="Договорились созвониться в четверг"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "ЗАПИСАТЬ"}
        </button>

        {state.message && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm",
              state.ok ? "text-ok" : "text-danger",
            )}
            role="status"
          >
            {state.ok ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <TriangleAlert className="size-4" aria-hidden />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

/** Напоминание себе: перезвонить, отправить КП, узнать решение. */
export function ReminderForm({ leadId }: { leadId: number }) {
  const [state, action, pending] = useActionState(createReminder, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="leadId" value={leadId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>О ЧЁМ НАПОМНИТЬ</span>
        <input
          name="message"
          required
          maxLength={500}
          placeholder="Перезвонить и узнать решение"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>КОГДА</span>
        <input
          type="datetime-local"
          name="remindAt"
          required
          className={cn(inputClass, "font-mono")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-[0.6rem] tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink disabled:opacity-60"
        >
          <BellPlus className="size-3.5" aria-hidden />
          {pending ? "СТАВЛЮ…" : "НАПОМНИТЬ"}
        </button>

        {state.message && (
          <span
            className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
            role="status"
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
