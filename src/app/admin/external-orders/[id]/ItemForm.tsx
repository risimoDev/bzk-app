"use client";

import { useActionState, useState } from "react";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  deleteExternalOrderItem,
  saveExternalOrderItem,
  type OrderFormState,
} from "@/app/actions/external-orders";
import type { ProductOption, SupplierOption } from "../new/OrderForm";
import { cn } from "@/lib/cn";
import { adminInputOnPaperClass, adminLabelClass } from "@/components/ui/form-classes";
import { ITEM_CATEGORY, ITEM_CATEGORY_ORDER, type ItemCategory } from "@/lib/order-structure";

const initial: OrderFormState = {};

export type ItemValues = {
  id: number;
  productId: number | null;
  itemName: string | null;
  itemDescription: string | null;
  quantity: number;
  /** Сумма строки целиком - форма спрашивает цену за единицу. */
  price: string;
  expenseAmount: string;
  isOutsourced: boolean;
  supplierId: number | null;
  itemCategory: ItemCategory;
  /** Срок подрядчику, «ГГГГ-ММ-ДД» для поля даты; пусто - не назначен. */
  contractorDueDate: string;
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

/** Цена за единицу из суммы строки - в базе хранится только сумма. */
function perUnit(total: string, quantity: number) {
  if (quantity <= 0) return "";
  const v = Number(total) / quantity;
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
}

/**
 * Позиция заказа: добавление и правка одной формой.
 *
 * Здесь же отмечается перезаказ - заказ уходит на сторону то целиком,
 * то частью, поэтому подрядчик выбирается на строке, а не на заказе.
 */
export function ItemForm({
  orderId,
  value,
  productList,
  suppliers,
}: {
  orderId: number;
  value?: ItemValues;
  productList: ProductOption[];
  suppliers: SupplierOption[];
}) {
  const [state, action, pending] = useActionState(saveExternalOrderItem, initial);

  const [productId, setProductId] = useState(value?.productId ? String(value.productId) : "");
  const [name, setName] = useState(value?.itemName ?? "");
  const [quantity, setQuantity] = useState(String(value?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(
    value ? perUnit(value.price, value.quantity) : "",
  );
  const [unitExpense, setUnitExpense] = useState(
    value ? perUnit(value.expenseAmount, value.quantity) : "",
  );
  const [outsourced, setOutsourced] = useState(value?.isOutsourced ?? false);
  const [supplierId, setSupplierId] = useState(
    value?.supplierId ? String(value.supplierId) : "",
  );
  const [category, setCategory] = useState<ItemCategory>(value?.itemCategory ?? "print");

  const pickProduct = (v: string) => {
    setProductId(v);
    const p = productList.find((x) => String(x.id) === v);
    if (p) {
      setName(p.name);
      setUnitPrice(p.basePrice);
    }
  };

  const sum = num(quantity) * num(unitPrice);
  const expense = num(quantity) * num(unitExpense);

  return (
    <form action={action} className="rounded-lg border border-ink/12 bg-paper p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {value && <input type="hidden" name="itemId" value={value.id} />}
      <input type="hidden" name="itemOutsourced" value={outsourced ? "1" : "0"} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className={labelClass}>ТОВАР ИЗ КАТАЛОГА</span>
          <select
            name="itemProductId"
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
          <span className={labelClass}>ПОДРОБНОСТИ</span>
          <input
            name="itemDescription"
            defaultValue={value?.itemDescription ?? ""}
            maxLength={2000}
            placeholder="Материал, размер, что важно не забыть"
            className={inputClass}
          />
          {outsourced && (
            <span className="text-xs text-warn">
              Эти подробности попадут в задание подрядчику - данные клиента сюда не вписывайте.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ВИД РАБОТ</span>
          <select
            name="itemCategory"
            value={category}
            onChange={(e) => setCategory(e.target.value as ItemCategory)}
            className={inputClass}
          >
            {ITEM_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {ITEM_CATEGORY[c].label}
              </option>
            ))}
          </select>
        </label>

        {/* Поле всегда в форме, но прячется у своей работы: пустое значение
            уходит на сервер и обнуляется там */}
        <label className={cn("flex flex-col gap-1.5", !outsourced && "hidden")}>
          <span className={labelClass}>СРОК ПОДРЯДЧИКУ</span>
          <input
            type="date"
            name="itemContractorDue"
            defaultValue={value?.contractorDueDate ?? ""}
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>КОЛИЧЕСТВО</span>
          <input
            name="itemQuantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ЦЕНА ЗА ЕД.</span>
          <input
            name="itemUnitPrice"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>СЕБЕСТОИМОСТЬ ЗА ЕД.</span>
          <input
            name="itemUnitExpense"
            value={unitExpense}
            onChange={(e) => setUnitExpense(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputClass, "font-mono")}
          />
        </label>

        <label className={cn("flex flex-col gap-1.5", !outsourced && "opacity-60")}>
          <span className={labelClass}>ПОДРЯДЧИК</span>
          <select
            name="itemSupplierId"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              if (e.target.value !== "") setOutsourced(true);
            }}
            className={inputClass}
          >
            <option value="">Не выбран</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-ink/8 pt-3">
        <label className="flex items-center gap-2 text-sm text-ink/75">
          <input
            type="checkbox"
            checked={outsourced}
            onChange={(e) => {
              setOutsourced(e.target.checked);
              if (!e.target.checked) setSupplierId("");
            }}
            className="size-4 accent-brand"
          />
          Перезаказываем у подрядчика
        </label>

        <span className="font-mono text-sm tabular-nums text-ink/60">
          строка {money.format(sum)} · затраты {money.format(expense)} · маржа{" "}
          <span className={sum - expense < 0 ? "text-danger" : "text-ok"}>
            {money.format(sum - expense)}
          </span>
        </span>

        <button
          type="submit"
          disabled={pending}
          className="ml-auto rounded-lg bg-brand px-5 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : value ? "СОХРАНИТЬ" : "ДОБАВИТЬ"}
        </button>
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

/** Удаление позиции - отдельной формой, чтобы не мешать сохранению. */
export function DeleteItemButton({
  orderId,
  itemId,
}: {
  orderId: number;
  itemId: number;
}) {
  const [state, action, pending] = useActionState(deleteExternalOrderItem, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <ConfirmButton
        title="Удалить позицию заказа?"
        text="Сумма, себестоимость и маржа заказа пересчитаются. Вернуть позицию можно, только заведя её заново."
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
