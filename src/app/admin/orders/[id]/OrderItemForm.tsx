"use client";

import { useActionState, useState } from "react";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { deleteOrderItem, saveOrderItem, type OrderItemState } from "../actions";
import { cn } from "@/lib/cn";
import { adminInputOnPaperClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: OrderItemState = {};

export type ProductOption = {
  id: number;
  name: string;
  basePrice: string;
  unit: string | null;
};

export type OrderItemValues = {
  id: number;
  productId: number | null;
  itemName: string | null;
  itemNote: string | null;
  quantity: number;
  unitPrice: string | null;
};

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
 * Позиция заказа с сайта: добавление и правка одной формой.
 *
 * Итог заказа после сохранения пересчитывается на сервере - вместе с
 * надбавкой за срочность и уже применённой скидкой.
 */
export function OrderItemForm({
  orderId,
  value,
  productList,
}: {
  orderId: number;
  value?: OrderItemValues;
  productList: ProductOption[];
}) {
  const [state, action, pending] = useActionState(saveOrderItem, initial);

  const [productId, setProductId] = useState(value?.productId ? String(value.productId) : "");
  const [name, setName] = useState(value?.itemName ?? "");
  const [quantity, setQuantity] = useState(String(value?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(value?.unitPrice ?? "");

  const pickProduct = (v: string) => {
    setProductId(v);
    const p = productList.find((x) => String(x.id) === v);
    if (p) {
      setName(p.name);
      setUnitPrice(p.basePrice);
    }
  };

  return (
    <form action={action} className="rounded-lg border border-ink/12 bg-paper p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {value && <input type="hidden" name="itemId" value={value.id} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className={labelClass}>ТОВАР ИЗ КАТАЛОГА</span>
          <select
            name="productId"
            value={productId}
            onChange={(e) => pickProduct(e.target.value)}
            className={inputClass}
          >
            <option value="">Своя позиция</option>
            {productList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className={labelClass}>НАЗВАНИЕ</span>
          <input
            name="itemName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={productId !== ""}
            maxLength={255}
            placeholder="Что делаем"
            className={cn(inputClass, productId !== "" && "text-ink/50")}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
          <span className={labelClass}>ЗАМЕТКА</span>
          <input
            name="itemNote"
            defaultValue={value?.itemNote ?? ""}
            maxLength={2000}
            placeholder="Что уточнили по телефону"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>КОЛИЧЕСТВО</span>
          <input
            name="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЦЕНА ЗА ЕД.</span>
          <input
            name="unitPrice"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <div className="flex flex-col justify-end gap-1.5">
          <span className={labelClass}>СУММА СТРОКИ</span>
          <output className="block px-1 py-2 font-mono text-sm tabular-nums text-ink">
            {money.format(num(quantity) * num(unitPrice))}
          </output>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
          >
            {pending ? "СОХРАНЯЮ…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
          </button>
        </div>
      </div>

      {(state.message || state.error) && (
        <p
          className={cn(
            "mt-3 flex items-center gap-2 text-sm",
            state.ok ? "text-ok" : "text-danger",
          )}
          role="status"
        >
          {state.ok ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <TriangleAlert className="size-4" aria-hidden />
          )}
          {state.message ?? state.error}
        </p>
      )}
    </form>
  );
}

export function DeleteOrderItemButton({
  orderId,
  itemId,
}: {
  orderId: number;
  itemId: number;
}) {
  const [state, action, pending] = useActionState(deleteOrderItem, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <ConfirmButton
        title="Удалить позицию заказа?"
        text="Сумма заказа пересчитается. Вернуть позицию можно, только заведя её заново."
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-ink/12 px-3 py-1.5 text-xs text-ink/50 hover:border-danger/40 hover:text-danger disabled:opacity-60"
      >
        <Trash2 className="size-3.5" aria-hidden />
        удалить
      </ConfirmButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputOnPaperClass;
