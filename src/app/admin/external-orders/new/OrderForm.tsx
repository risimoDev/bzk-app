"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  createExternalOrder,
  type OrderFormState,
} from "@/app/actions/external-orders";
import { externalOrderTotal } from "@/lib/order-money";
import { counterpartyLabel } from "@/lib/counterparties";
import { cn } from "@/lib/cn";
import { DebtWarning } from "@/components/admin/DebtWarning";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";
import { ITEM_CATEGORY, ITEM_CATEGORY_ORDER, type ItemCategory } from "@/lib/order-structure";

const initial: OrderFormState = {};

export type CounterpartyOption = {
  id: number;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type ProductOption = {
  id: number;
  name: string;
  basePrice: string;
  unit: string | null;
};

export type SupplierOption = { id: number; name: string };

type Row = {
  key: number;
  productId: string;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unitExpense: string;
  outsourced: boolean;
  supplierId: string;
  category: ItemCategory;
  contractorDue: string;
};

const emptyRow = (key: number): Row => ({
  key,
  productId: "",
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  unitExpense: "",
  outsourced: false,
  supplierId: "",
  category: "print",
  contractorDue: "",
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
 * Заведение заказа менеджера.
 *
 * Заказчик берётся из справочника или заводится тут же - второй раз
 * вписывать его руками не придётся. Позиции считаются на лету, чтобы
 * менеджер видел итог до отправки, а не после.
 */
export function OrderForm({
  counterparties,
  productList,
  suppliers,
  defaultClientId,
  debtWarnings,
  debtHref,
}: {
  counterparties: CounterpartyOption[];
  productList: ProductOption[];
  suppliers: SupplierOption[];
  defaultClientId?: number;
  /** Просроченный долг 15+ дней по контрагентам (id -> заказов, сумма). Только предупреждение. */
  debtWarnings?: Record<number, { n: number; sum?: number }>;
  /** Ссылка на страницу долгов; нет права смотреть финансы - нет и ссылки. */
  debtHref?: string;
}) {
  const [state, action, pending] = useActionState(createExternalOrder, initial);

  const [mode, setMode] = useState<"existing" | "new">(
    counterparties.length > 0 ? "existing" : "new",
  );
  const [clientId, setClientId] = useState(defaultClientId ? String(defaultClientId) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [adjustment, setAdjustment] = useState("");
  const [paidNow, setPaidNow] = useState<"none" | "full" | "partial">("none");

  const patch = (key: number, over: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...over } : r)));

  // Выбор контрагента подставляет его контакты: в заказе они хранятся
  // отдельной копией - на момент заказа телефон мог быть другим
  const pickCounterparty = (value: string) => {
    setClientId(value);
    const c = counterparties.find((x) => String(x.id) === value);
    if (!c) return;
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
  };

  const pickProduct = (key: number, value: string) => {
    const p = productList.find((x) => String(x.id) === value);
    patch(key, {
      productId: value,
      name: p ? p.name : "",
      unitPrice: p ? p.basePrice : "",
    });
  };

  const itemsSum = rows.reduce((s, r) => s + num(r.quantity) * num(r.unitPrice), 0);
  const expenseSum = rows.reduce((s, r) => s + num(r.quantity) * num(r.unitExpense), 0);
  // Минус телефоны подставляют «длинный» - сервер его понимает, и здесь так же
  const adjValue = num(adjustment.replace(/^[\u2212\u2013]/, "-"));
  const finalTotal = externalOrderTotal(itemsSum, adjValue);
  const margin = finalTotal - expenseSum;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="clientMode" value={mode} />

      {/* ------------------------------------------------- заказчик */}
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base text-ink">Заказчик</h2>
          <div className="flex gap-1.5">
            <Toggle active={mode === "existing"} onClick={() => setMode("existing")}>
              ИЗ СПРАВОЧНИКА
            </Toggle>
            <Toggle active={mode === "new"} onClick={() => setMode("new")}>
              НОВЫЙ
            </Toggle>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {mode === "existing" ? (
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={labelClass}>КОНТРАГЕНТ</span>
              <select
                name="clientId"
                value={clientId}
                onChange={(e) => pickCounterparty(e.target.value)}
                className={cn(inputClass, state.fieldErrors?.clientId && "border-danger")}
              >
                <option value="">Выберите заказчика</option>
                {counterparties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {counterpartyLabel(c)}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.clientId && (
                <span className="text-xs text-danger">{state.fieldErrors.clientId}</span>
              )}
              <DebtWarning info={clientId ? debtWarnings?.[Number(clientId)] : null} href={debtHref} className="mt-1.5" />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={labelClass}>ИМЯ ИЛИ ОРГАНИЗАЦИЯ</span>
              <input
                name="clientName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                placeholder="Как записать заказчика"
                className={cn(inputClass, state.fieldErrors?.clientName && "border-danger")}
              />
              <span className="text-xs text-ink/45">
                Он сохранится в справочнике - в следующий раз выберется из списка.
              </span>
              {state.fieldErrors?.clientName && (
                <span className="text-xs text-danger">{state.fieldErrors.clientName}</span>
              )}
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ТЕЛЕФОН</span>
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
              placeholder="+7 (902) 000-00-00"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ПОЧТА</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              placeholder="client@example.com"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>АДРЕС</span>
            <input
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={1000}
              placeholder="Куда везти готовое"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {/* -------------------------------------------------- позиции */}
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <h2 className="font-display text-base text-ink">Состав заказа</h2>
        <p className="mt-1 text-sm text-ink/50">
          Цена и себестоимость - за единицу. Сумма строки считается сама.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {rows.map((row, i) => (
            <fieldset
              key={row.key}
              className="rounded-lg border border-ink/12 bg-paper p-4"
            >
              <legend className="px-1 font-display text-[0.6rem] tracking-[0.16em] text-ink/40">
                ПОЗИЦИЯ {i + 1}
              </legend>

              {/* Значения строки едут отдельными списками одинаковой длины */}
              <input type="hidden" name="itemOutsourced" value={row.outsourced ? "1" : "0"} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5 lg:col-span-2">
                  <span className={labelClass}>ТОВАР ИЗ КАТАЛОГА</span>
                  <select
                    name="itemProductId"
                    value={row.productId}
                    onChange={(e) => pickProduct(row.key, e.target.value)}
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
                    value={row.name}
                    onChange={(e) => patch(row.key, { name: e.target.value })}
                    // readOnly, а не disabled: отключённое поле браузер не
                    // отправляет вовсе, и списки значений позиций разъехались
                    // бы на строку
                    readOnly={row.productId !== ""}
                    maxLength={255}
                    placeholder="Например: баннер 3×1 м, люверсы"
                    className={cn(inputClass, row.productId !== "" && "text-ink/50")}
                  />
                </label>

                <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <span className={labelClass}>ПОДРОБНОСТИ</span>
                  <input
                    name="itemDescription"
                    value={row.description}
                    onChange={(e) => patch(row.key, { description: e.target.value })}
                    maxLength={2000}
                    placeholder="Материал, размер, что важно не забыть"
                    className={inputClass}
                  />
                  {row.outsourced && (
                    <span className="text-xs text-warn">
                      Эти подробности попадут в задание подрядчику - данные клиента сюда не
                      вписывайте.
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>ВИД РАБОТ</span>
                  <select
                    name="itemCategory"
                    value={row.category}
                    onChange={(e) => patch(row.key, { category: e.target.value as ItemCategory })}
                    className={inputClass}
                  >
                    {ITEM_CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {ITEM_CATEGORY[c].label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Поле всегда в форме: значения позиций едут списками одной
                    длины. У своей работы оно скрыто, сервер его обнуляет */}
                <label className={cn("flex flex-col gap-1.5", !row.outsourced && "hidden")}>
                  <span className={labelClass}>СРОК ПОДРЯДЧИКУ</span>
                  <input
                    type="date"
                    name="itemContractorDue"
                    value={row.contractorDue}
                    onChange={(e) => patch(row.key, { contractorDue: e.target.value })}
                    className={cn(inputClass, "font-mono")}
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

                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>ЦЕНА ЗА ЕД.</span>
                  <input
                    name="itemUnitPrice"
                    value={row.unitPrice}
                    onChange={(e) => patch(row.key, { unitPrice: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass, "font-mono")}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>СЕБЕСТОИМОСТЬ ЗА ЕД.</span>
                  <input
                    name="itemUnitExpense"
                    value={row.unitExpense}
                    onChange={(e) => patch(row.key, { unitExpense: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={cn(inputClass, "font-mono")}
                  />
                </label>

                <div className="flex flex-col justify-end gap-1.5">
                  <span className={labelClass}>СУММА СТРОКИ</span>
                  <output className="block rounded-lg border border-transparent px-3 py-2 font-mono text-sm tabular-nums text-ink">
                    {money.format(num(row.quantity) * num(row.unitPrice))}
                  </output>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-ink/8 pt-3">
                <label className="flex items-center gap-2 text-sm text-ink/75">
                  <input
                    type="checkbox"
                    checked={row.outsourced}
                    onChange={(e) =>
                      patch(row.key, {
                        outsourced: e.target.checked,
                        supplierId: e.target.checked ? row.supplierId : "",
                      })
                    }
                    className="size-4 accent-brand"
                  />
                  Перезаказываем у подрядчика
                </label>

                <label className={cn("flex flex-col gap-1.5", !row.outsourced && "opacity-60")}>
                  <span className={labelClass}>ПОДРЯДЧИК</span>
                  <select
                    name="itemSupplierId"
                    value={row.supplierId}
                    // Выбор подрядчика сам ставит галочку перезаказа: иначе
                    // выбранное значение молча потерялось бы на сервере
                    onChange={(e) =>
                      patch(row.key, {
                        supplierId: e.target.value,
                        outsourced: e.target.value !== "" || row.outsourced,
                      })
                    }
                    className={cn(inputClass, "min-w-52")}
                  >
                    <option value="">Не выбран</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/12 px-3 py-2 text-xs text-ink/50 hover:border-danger/40 hover:text-danger"
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

      {/* ---------------------------------------- сроки, оплата, итог */}
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>СРОК ГОТОВНОСТИ</span>
            <input type="date" name="readyDate" className={cn(inputClass, "font-mono")} />
          </label>

          {/* Оплата при оформлении - это платёж, а не статус: статус потом
              считается из платежей. Поэтому «частично» - только с суммой */}
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ОПЛАЧЕНО ПРИ ОФОРМЛЕНИИ</span>
            <select
              name="paidNow"
              value={paidNow}
              onChange={(e) => setPaidNow(e.target.value as "none" | "full" | "partial")}
              className={inputClass}
            >
              <option value="none">Нет</option>
              <option value="full">Полностью</option>
              <option value="partial">Частично</option>
            </select>
          </label>

          {paidNow === "partial" ? (
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>СКОЛЬКО ЗАПЛАТИЛИ, ₽</span>
              <input
                name="paidAmount"
                inputMode="decimal"
                placeholder="0.00"
                className={cn(
                  inputClass,
                  "font-mono",
                  state.fieldErrors?.paidAmount && "border-danger",
                )}
              />
              {state.fieldErrors?.paidAmount && (
                <span className="text-xs text-danger">{state.fieldErrors.paidAmount}</span>
              )}
            </label>
          ) : (
            <span className="hidden lg:block" aria-hidden />
          )}

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>КОРРЕКТИРОВКА ИТОГА, ₽</span>
            <input
              name="adjustment"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={cn(
                inputClass,
                "font-mono",
                state.fieldErrors?.adjustment && "border-danger",
              )}
            />
            <span className="text-xs text-ink/45">
              Скидка на заказ целиком - с минусом (-500), наценка - без. Пусто - итог
              равен сумме позиций.
            </span>
            {state.fieldErrors?.adjustment && (
              <span className="text-xs text-danger">{state.fieldErrors.adjustment}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <span className={labelClass}>ЗА ЧТО КОРРЕКТИРОВКА</span>
            {/* Без корректировки заметка не сохраняется - поле выключено */}
            <input
              name="adjustmentNote"
              maxLength={255}
              disabled={adjValue === 0}
              placeholder={
                adjValue === 0
                  ? "Сначала укажите корректировку"
                  : "Скидка постоянному клиенту, доставка"
              }
              className={cn(inputClass, adjValue === 0 && "opacity-50")}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <span className={labelClass}>ОПИСАНИЕ</span>
            <textarea
              name="description"
              rows={2}
              maxLength={5000}
              placeholder="Что делаем, о чём договорились"
              className={cn(inputClass, "resize-y")}
            />
          </label>
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-ink/10 pt-4 text-sm">
          <Total label="Сумма позиций" value={money.format(itemsSum)} />
          <Total label="Себестоимость" value={money.format(expenseSum)} />
          <Total label="Итог" value={money.format(finalTotal)} strong />
          <Total
            label="Маржа"
            value={money.format(margin)}
            tone={margin < 0 ? "danger" : "ok"}
          />
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ЗАВОЖУ…" : "ЗАВЕСТИ ЗАКАЗ"}
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

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-3.5 py-1.5 font-display text-[0.6rem] tracking-wider transition-colors",
        active
          ? "bg-brand text-bone"
          : "border border-ink/12 text-ink/55 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Total({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="flex flex-col">
      <dt className={labelClass}>{label.toUpperCase()}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          strong ? "text-lg text-ink" : "text-ink/70",
          tone === "ok" && "text-ok",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
