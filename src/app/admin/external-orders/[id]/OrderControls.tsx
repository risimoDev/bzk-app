"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Check, TriangleAlert } from "lucide-react";
import {
  deleteExternalOrder,
  setProductionStatus,
  setReadyDate,
  updateExternalOrder,
  type ExternalState,
  type OrderFormState,
} from "@/app/actions/external-orders";
import { attachOrderToCounterparty } from "@/app/actions/counterparties";
import { EXTERNAL_PRODUCTION_STATUS } from "@/lib/external-orders";
import { nextStatuses } from "@/lib/order-status";
import { externalOrderTotal } from "@/lib/order-money";
import { counterpartyLabel } from "@/lib/counterparties";
import { cn } from "@/lib/cn";
import { adminLabelClass } from "@/components/ui/form-classes";

const initial: ExternalState = { ok: false };
const blank: OrderFormState = {};

/**
 * Производство: статусов восемь, здесь удобнее список. В нём только
 * допустимые переходы из текущего - ту же таблицу проверяет сервер.
 */
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
        // После сохранения статус другой - пересоздаём поле, иначе React
        // оставит прежний выбор
        key={status ?? "pending"}
        defaultValue={status ?? "pending"}
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
      >
        {nextStatuses(status).map((key) => (
          <option key={key} value={key}>
            {EXTERNAL_PRODUCTION_STATUS[key].label}
          </option>
        ))}
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
 * Шапка заказа: на кого оформлен, контакты, описание и корректировка.
 *
 * Итог руками не вписывается: он сумма позиций плюс корректировка, и
 * форма показывает расчёт. Раньше итог был отдельным полем и после
 * правки позиций молча расходился с ними.
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
    itemsSum: number;
    adjustment: string;
    adjustmentNote: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateExternalOrder, blank);
  const [adjustment, setAdjustment] = useState(
    Number(order.adjustment) === 0 ? "" : order.adjustment,
  );
  const parsed = Number(adjustment.replace(/\s/g, "").replace(",", ".").replace(/^[\u2212\u2013]/, "-"));
  const preview = externalOrderTotal(order.itemsSum, Number.isFinite(parsed) ? parsed : 0);
  const hasAdjustment = Number.isFinite(parsed) && parsed !== 0;

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
        <span className={labelClass}>КОРРЕКТИРОВКА ИТОГА, ₽</span>
        <input
          name="adjustment"
          value={adjustment}
          onChange={(e) => setAdjustment(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className={cn(
            fieldClass,
            "font-mono",
            state.fieldErrors?.adjustment && "border-danger",
          )}
        />
        <span className="text-xs text-ink/45">
          Скидка - с минусом (-500), наценка - без. Итог:{" "}
          {money.format(order.itemsSum)} {Number.isFinite(parsed) && parsed < 0 ? "−" : "+"}{" "}
          {money.format(Math.abs(Number.isFinite(parsed) ? parsed : 0))} ={" "}
          <b className="font-mono text-ink/70">{money.format(preview)}</b>
        </span>
        {state.fieldErrors?.adjustment && (
          <span className="text-xs text-danger">{state.fieldErrors.adjustment}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className={labelClass}>ЗА ЧТО КОРРЕКТИРОВКА</span>
        {/* Без корректировки заметка не сохраняется (сервер её сбрасывает),
            поэтому и поле выключено - чтобы не казалось, что она записана */}
        <input
          name="adjustmentNote"
          defaultValue={order.adjustmentNote ?? ""}
          maxLength={255}
          disabled={!hasAdjustment}
          placeholder={
            hasAdjustment ? "Скидка постоянному клиенту, доставка" : "Сначала укажите корректировку"
          }
          className={cn(fieldClass, !hasAdjustment && "opacity-50")}
        />
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
        Позиции и бухгалтерская карточка уйдут вместе с заказом. Если по заказу уже
        были платежи или списания со склада, удалить его нельзя - такой заказ
        отменяют.
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

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const labelClass = adminLabelClass;
const fieldClass =
  "w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";
