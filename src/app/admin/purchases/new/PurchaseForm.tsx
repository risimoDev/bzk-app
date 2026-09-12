"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { createPurchase, type PurchaseFormState } from "../actions";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: PurchaseFormState = {};

export type MaterialOption = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: string | null;
};

export type SupplierOption = { id: number; name: string };

type Row = {
  key: number;
  materialId: string;
  quantity: string;
  unitPrice: string;
  note: string;
};

const emptyRow = (key: number): Row => ({
  key,
  materialId: "",
  quantity: "1",
  unitPrice: "",
  note: "",
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
 * Новая закупка.
 *
 * Цена подставляется из карточки материала - чаще всего берут по той
 * же цене, что и в прошлый раз, и перебивать её приходится редко.
 */
export function PurchaseForm({
  suppliers,
  materialList,
}: {
  suppliers: SupplierOption[];
  materialList: MaterialOption[];
}) {
  const [state, action, pending] = useActionState(createPurchase, initial);
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [shipping, setShipping] = useState("");

  const patch = (key: number, over: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...over } : r)));

  const pickMaterial = (key: number, value: string) => {
    const m = materialList.find((x) => String(x.id) === value);
    patch(key, { materialId: value, unitPrice: m?.costPerUnit ?? "" });
  };

  const goods = rows.reduce((s, r) => s + num(r.quantity) * num(r.unitPrice), 0);
  const total = goods + num(shipping);

  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ПОДРЯДЧИК</span>
            <select
              name="supplierId"
              defaultValue=""
              className={cn(inputClass, state.fieldErrors?.supplierId && "border-danger")}
            >
              <option value="">Выберите подрядчика</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.supplierId && (
              <span className="text-xs text-danger">{state.fieldErrors.supplierId}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ЖДЁМ К ДАТЕ</span>
            <input
              type="date"
              name="expectedDeliveryDate"
              className={cn(inputClass, "font-mono")}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>ЗАМЕТКИ</span>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              placeholder="О чём договорились: условия, оплата, самовывоз"
              className={cn(inputClass, "resize-y")}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <h2 className="font-display text-base text-ink">Что закупаем</h2>

        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row, i) => {
            const m = materialList.find((x) => String(x.id) === row.materialId);
            return (
              <fieldset
                key={row.key}
                className="grid gap-3 rounded-lg border border-ink/12 bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <legend className="px-1 font-display text-[0.6rem] tracking-[0.16em] text-ink/40">
                  ПОЗИЦИЯ {i + 1}
                </legend>

                <label className="flex flex-col gap-1.5 lg:col-span-2">
                  <span className={labelClass}>МАТЕРИАЛ</span>
                  <select
                    name="itemMaterialId"
                    value={row.materialId}
                    onChange={(e) => pickMaterial(row.key, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Не выбран</option>
                    {materialList.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>
                    КОЛИЧЕСТВО{m ? `, ${m.unit}` : ""}
                  </span>
                  <input
                    name="itemQuantity"
                    value={row.quantity}
                    onChange={(e) => patch(row.key, { quantity: e.target.value })}
                    inputMode="decimal"
                    className={cn(inputClass, "font-mono")}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>ЦЕНА ЗА ЕД., ₽</span>
                  <input
                    name="itemUnitPrice"
                    value={row.unitPrice}
                    onChange={(e) => patch(row.key, { unitPrice: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass, "font-mono")}
                  />
                </label>

                <label className="flex flex-col gap-1.5 lg:col-span-3">
                  <span className={labelClass}>ЗАМЕТКА К ПОЗИЦИИ</span>
                  <input
                    name="itemNote"
                    value={row.note}
                    onChange={(e) => patch(row.key, { note: e.target.value })}
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <div className="flex items-end justify-between gap-3">
                  <span className="font-mono text-sm tabular-nums text-ink">
                    {money.format(num(row.quantity) * num(row.unitPrice))}
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
            );
          })}
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
          ЕЩЁ МАТЕРИАЛ
        </button>

        <div className="mt-5 flex flex-wrap items-end gap-6 border-t border-ink/10 pt-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ДОСТАВКА, ₽</span>
            <input
              name="shippingCost"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={cn(inputClass, "w-40 font-mono")}
            />
          </label>

          <div className="flex flex-col">
            <span className={labelClass}>ИТОГО</span>
            <span className="font-mono text-lg tabular-nums text-ink">
              {money.format(total)}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ЗАВОЖУ…" : "ЗАВЕСТИ ЗАКУПКУ"}
        </button>
        <span className="text-xs text-ink/45">
          Закупка заведётся черновиком. На склад материалы попадут при приёмке.
        </span>
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
