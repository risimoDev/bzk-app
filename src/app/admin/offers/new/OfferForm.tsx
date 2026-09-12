"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { createOffer, type OfferState } from "@/app/actions/offers";
import { counterpartyLabel } from "@/lib/counterparties";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: OfferState = {};

export type CounterpartyOption = {
  id: number;
  name: string;
  companyName: string | null;
};

type Row = {
  key: number;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  price: string;
};

const emptyRow = (key: number): Row => ({
  key,
  name: "",
  description: "",
  unit: "шт.",
  quantity: "1",
  price: "",
});

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const num = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Новое коммерческое предложение.
 *
 * Позиции здесь свои, не из каталога: КП пишут под задачу, и в нём
 * часто оказывается то, чего в прайсе нет.
 */
export function OfferForm({
  counterparties,
}: {
  counterparties: CounterpartyOption[];
}) {
  const [state, action, pending] = useActionState(createOffer, initial);
  const [clientId, setClientId] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [discount, setDiscount] = useState("0");

  const patch = (key: number, over: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...over } : r)));

  const subtotal = rows.reduce((s, r) => s + num(r.quantity) * num(r.price), 0);
  const total = subtotal * (1 - Math.min(num(discount), 100) / 100);

  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <h2 className="font-display text-base text-ink">Кому</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>КОНТРАГЕНТ ИЗ СПРАВОЧНИКА</span>
            <select
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={inputClass}
            >
              <option value="">Не из справочника - впишу вручную</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {counterpartyLabel(c)}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink/45">
              Если выбрать, имя и контакты возьмутся из карточки, а принятое КП
              превратится в заказ на него же.
            </span>
          </label>

          {clientId === "" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ИМЯ</span>
                <input
                  name="clientName"
                  maxLength={255}
                  className={cn(inputClass, state.fieldErrors?.clientName && "border-danger")}
                />
                {state.fieldErrors?.clientName && (
                  <span className="text-xs text-danger">
                    {state.fieldErrors.clientName}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ОРГАНИЗАЦИЯ</span>
                <input name="clientCompany" maxLength={255} className={inputClass} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ПОЧТА</span>
                <input
                  name="clientEmail"
                  type="email"
                  maxLength={255}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ТЕЛЕФОН</span>
                <input name="clientPhone" maxLength={50} className={inputClass} />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>АДРЕС</span>
            <input name="clientAddress" maxLength={1000} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <h2 className="font-display text-base text-ink">Что предлагаем</h2>

        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row, i) => (
            <fieldset
              key={row.key}
              className="grid gap-3 rounded-lg border border-ink/12 bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <legend className="px-1 font-display text-[0.6rem] tracking-[0.16em] text-ink/40">
                ПОЗИЦИЯ {i + 1}
              </legend>

              <label className="flex flex-col gap-1.5 lg:col-span-2">
                <span className={labelClass}>НАЗВАНИЕ</span>
                <input
                  name="itemName"
                  value={row.name}
                  onChange={(e) => patch(row.key, { name: e.target.value })}
                  maxLength={255}
                  placeholder="Печать баннера 3×1 м"
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ЕДИНИЦА</span>
                <input
                  name="itemUnit"
                  value={row.unit}
                  onChange={(e) => patch(row.key, { unit: e.target.value })}
                  maxLength={50}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>КОЛИЧЕСТВО</span>
                <input
                  name="itemQuantity"
                  value={row.quantity}
                  onChange={(e) => patch(row.key, { quantity: e.target.value })}
                  inputMode="numeric"
                  className={cn(inputClass, "font-mono")}
                />
              </label>

              <label className="flex flex-col gap-1.5 lg:col-span-2">
                <span className={labelClass}>ПОДРОБНОСТИ</span>
                <input
                  name="itemDescription"
                  value={row.description}
                  onChange={(e) => patch(row.key, { description: e.target.value })}
                  maxLength={2000}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>ЦЕНА ЗА ЕД., ₽</span>
                <input
                  name="itemPrice"
                  value={row.price}
                  onChange={(e) => patch(row.key, { price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={cn(inputClass, "font-mono")}
                />
              </label>

              <div className="flex items-end justify-between gap-3">
                <span className="font-mono text-sm tabular-nums text-ink">
                  {money.format(num(row.quantity) * num(row.price))}
                </span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/12 px-3 py-2 text-xs text-ink/50 hover:border-danger/40 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    убрать
                  </button>
                )}
              </div>
            </fieldset>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, emptyRow(nextKey)]);
            setNextKey((k) => k + 1);
          }}
          className="mt-4 flex items-center gap-2 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
        >
          <Plus className="size-3.5" aria-hidden />
          ЕЩЁ ПОЗИЦИЯ
        </button>
      </section>

      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>СКИДКА, %</span>
            <input
              name="discountPercent"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              className={cn(
                inputClass,
                "font-mono",
                state.fieldErrors?.discountPercent && "border-danger",
              )}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ПРЕДОПЛАТА, %</span>
            <input
              name="prepaymentPercent"
              defaultValue="100"
              inputMode="decimal"
              className={cn(inputClass, "font-mono")}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>СРОК ИЗГОТОВЛЕНИЯ, ДНЕЙ</span>
            <input
              name="productionDays"
              inputMode="numeric"
              className={cn(inputClass, "font-mono")}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ДЕЙСТВУЕТ ДО</span>
            <input type="date" name="validUntil" className={cn(inputClass, "font-mono")} />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>УСЛОВИЯ ОПЛАТЫ</span>
            <input
              name="paymentTerms"
              maxLength={255}
              placeholder="Например: 50% предоплата, остаток при получении"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>ЗАМЕТКИ</span>
            <textarea
              name="notes"
              rows={2}
              maxLength={5000}
              className={cn(inputClass, "resize-y")}
            />
          </label>
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-ink/10 pt-4">
          <div className="flex flex-col">
            <dt className={labelClass}>СУММА ПОЗИЦИЙ</dt>
            <dd className="font-mono tabular-nums text-ink/70">
              {money.format(subtotal)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className={labelClass}>ИТОГ СО СКИДКОЙ</dt>
            <dd className="font-mono text-lg tabular-nums text-ink">
              {money.format(total)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ЗАВОЖУ…" : "СОЗДАТЬ КП"}
        </button>
        {state.error && (
          <span className="flex items-center gap-2 text-sm text-danger" role="status">
            <TriangleAlert className="size-4" aria-hidden />
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
