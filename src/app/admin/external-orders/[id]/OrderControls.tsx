"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Check, TriangleAlert } from "lucide-react";
import {
  deleteExternalOrder,
  setPaymentStatus,
  setProductionStatus,
  setReadyDate,
  updateExternalOrder,
  type ExternalState,
  type OrderFormState,
} from "@/app/actions/external-orders";
import { attachOrderToCounterparty } from "@/app/actions/counterparties";
import {
  EXTERNAL_PAYMENT_STATUS,
  EXTERNAL_PRODUCTION_STATUS,
  type ExternalPaymentStatus,
  type ExternalProductionStatus,
} from "@/lib/external-orders";
import { counterpartyLabel } from "@/lib/counterparties";
import { cn } from "@/lib/cn";
import { adminLabelClass } from "@/components/ui/form-classes";

const initial: ExternalState = { ok: false };
const blank: OrderFormState = {};

/** Оплата: три состояния, поэтому кнопки, а не список. */
export function PaymentControls({
  orderId,
  status,
}: {
  orderId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setPaymentStatus, initial);
  const current = status ?? "unpaid";

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      {(Object.keys(EXTERNAL_PAYMENT_STATUS) as ExternalPaymentStatus[]).map((key) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="submit"
            name="status"
            value={key}
            disabled={pending || active}
            className={cn(
              "rounded px-3 py-1 font-display text-[0.6rem] tracking-wider transition-colors",
              active
                ? EXTERNAL_PAYMENT_STATUS[key].className
                : "border border-ink/12 text-ink/45 hover:border-ink/30 hover:text-ink",
              pending && "opacity-60",
            )}
          >
            {EXTERNAL_PAYMENT_STATUS[key].label}
          </button>
        );
      })}
      {state.message && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Производство: статусов восемь, здесь удобнее список. */
export function ProductionControls({
  orderId,
  status,
}: {
  orderId: number;
  status: string | null;
}) {
  const [state, action, pending] = useActionState(setProductionStatus, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor={`prod-${orderId}`} className="sr-only">
        Производственный статус
      </label>
      <select
        id={`prod-${orderId}`}
        name="productionStatus"
        defaultValue={status ?? "pending"}
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      >
        {(Object.keys(EXTERNAL_PRODUCTION_STATUS) as ExternalProductionStatus[]).map(
          (key) => (
            <option key={key} value={key}>
              {EXTERNAL_PRODUCTION_STATUS[key].label}
            </option>
          ),
        )}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-graphite disabled:opacity-60"
      >
        {pending ? "СОХРАНЯЮ…" : "ПРИМЕНИТЬ"}
      </button>
      {state.message && (
        <span className={cn("text-xs", state.ok ? "text-ok" : "text-danger")} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

/**
 * Срок готовности. Сдвиг вперёд требует причины - иначе через месяц
 * никто не вспомнит, почему заказ поехал.
 */
export function ReadyDateForm({
  orderId,
  current,
}: {
  orderId: number;
  current: string;
}) {
  const [state, action, pending] = useActionState(setReadyDate, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
            ГОТОВНОСТЬ
          </span>
          <input
            type="date"
            name="readyDate"
            defaultValue={current}
            required
            className="rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1.5">
          <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
            ПРИЧИНА ИЗМЕНЕНИЯ
          </span>
          <input
            name="reason"
            maxLength={300}
            placeholder="Обязательна, если срок сдвигается вперёд"
            className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          <CalendarClock className="size-3.5" aria-hidden />
          {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
        </button>
      </div>

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
    </form>
  );
}

/**
 * Шапка заказа: на кого оформлен, контакты, описание и итог.
 *
 * Срок готовности сюда не входит - он живёт отдельной формой, потому
 * что каждое его изменение уходит в историю переносов.
 */
export function OrderHeaderForm({
  order,
}: {
  order: {
    id: number;
    clientName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    description: string | null;
    totalPrice: string;
  };
}) {
  const [state, action, pending] = useActionState(updateExternalOrder, blank);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="orderId" value={order.id} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ЗАКАЗЧИК В ЗАКАЗЕ</span>
        <input
          name="clientName"
          defaultValue={order.clientName}
          maxLength={255}
          className={cn(fieldClass, state.fieldErrors?.clientName && "border-danger")}
        />
        {state.fieldErrors?.clientName && (
          <span className="text-xs text-danger">{state.fieldErrors.clientName}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ИТОГ ЗАКАЗА</span>
        <input
          name="totalPrice"
          defaultValue={order.totalPrice}
          inputMode="decimal"
          className={cn(
            fieldClass,
            "font-mono",
            state.fieldErrors?.totalPrice && "border-danger",
          )}
        />
        {state.fieldErrors?.totalPrice && (
          <span className="text-xs text-danger">{state.fieldErrors.totalPrice}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ТЕЛЕФОН</span>
        <input
          name="phone"
          defaultValue={order.phone ?? ""}
          maxLength={50}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ПОЧТА</span>
        <input
          name="email"
          type="email"
          defaultValue={order.email ?? ""}
          maxLength={255}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className={labelClass}>АДРЕС</span>
        <input
          name="address"
          defaultValue={order.address ?? ""}
          maxLength={1000}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className={labelClass}>ОПИСАНИЕ</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={order.description ?? ""}
          maxLength={5000}
          className={cn(fieldClass, "resize-y")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
        </button>
        {(state.message || state.error) && (
          <span
            className={cn("text-sm", state.ok ? "text-ok" : "text-danger")}
            role="status"
          >
            {state.message ?? state.error}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Контрагент заказа.
 *
 * У заказов, перенесённых со старого сайта, его нет: там было только имя
 * строкой. Прицепить заказ к контрагенту можно здесь - после этого он
 * попадёт в его карточку, а если контрагент связан с аккаунтом, то и
 * в личный кабинет.
 */
export function CounterpartyPicker({
  orderId,
  current,
  options,
}: {
  orderId: number;
  current: number | null;
  options: { id: number; name: string; companyName: string | null }[];
}) {
  const [state, action, pending] = useActionState(attachOrderToCounterparty, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>КОНТРАГЕНТ</span>
        <select
          name="clientId"
          // Пересоздаём поле после сохранения: defaultValue у живого узла
          // React уже не трогает, и выбор показывался бы прежний
          key={String(current)}
          defaultValue={current ? String(current) : ""}
          className={fieldClass}
        >
          <option value="">Не выбран</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {counterpartyLabel(o)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        {pending ? "СОХРАНЯЮ…" : "ПРИЦЕПИТЬ"}
      </button>
      {(state.message || state.error) && (
        <span
          className={cn("text-xs", state.ok ? "text-ok" : "text-danger")}
          role="status"
        >
          {state.message ?? state.error}
        </span>
      )}
    </form>
  );
}

/** Удаление заказа целиком - только администратору. */
export function DeleteOrderButton({ orderId }: { orderId: number }) {
  const [state, action, pending] = useActionState(deleteExternalOrder, blank);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/50 hover:border-danger/40 hover:text-danger"
      >
        УДАЛИТЬ ЗАКАЗ
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm text-ink/70">
        Позиции уйдут вместе с заказом. Бухгалтерская карточка останется - деньги по
        нему могли уже пройти.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-danger px-4 py-2 font-display text-xs tracking-wider text-bone hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "УДАЛЯЮ…" : "ДА, УДАЛИТЬ"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/60 hover:border-ink/30 hover:text-ink"
        >
          ОТМЕНА
        </button>
      </div>
      {state.error && (
        <span className="text-xs text-danger" role="status">
          {state.error}
        </span>
      )}
    </form>
  );
}

const labelClass = adminLabelClass;
const fieldClass =
  "w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";
