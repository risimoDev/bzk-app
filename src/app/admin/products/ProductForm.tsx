"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { saveProduct, type ProductState } from "./actions";
import { cn } from "@/lib/cn";

type Product = {
  id: number;
  name: string;
  description: string | null;
  basePrice: string;
  unit: string | null;
  minQuantity: number;
  multiplicity: number;
  isHidden: boolean;
  isPopular: boolean;
  categoryId: number | null;
};

export type CategoryOption = { id: number; name: string };

/**
 * Карточка товара. Без `product` это форма заведения нового: поля те же,
 * меняются только заголовок кнопки и отсутствие скрытого `id`.
 */
export function ProductForm({
  product,
  categoryList,
  readOnly,
}: {
  product?: Product;
  categoryList: CategoryOption[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ProductState, FormData>(
    saveProduct,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      {product && <input type="hidden" name="id" value={product.id} />}

      {state.error && (
        <Banner tone="error">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </Banner>
      )}
      {state.ok && (
        <Banner tone="ok">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          Сохранено. Изменения уже видны на витрине.
        </Banner>
      )}

      <Field id="name" label="Название" error={err.name}>
        <input
          id="name"
          name="name"
          defaultValue={product?.name ?? ""}
          disabled={readOnly}
          required
          className={input(err.name)}
        />
      </Field>

      <Field id="description" label="Описание" error={err.description}>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product?.description ?? ""}
          disabled={readOnly}
          className={cn(input(err.description), "resize-y")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="basePrice"
          label="Базовая цена, ₽"
          error={err.basePrice}
          hint="Цены по тиражам задаются отдельно"
        >
          <input
            id="basePrice"
            name="basePrice"
            defaultValue={product?.basePrice ?? ""}
            disabled={readOnly}
            inputMode="decimal"
            className={cn(input(err.basePrice), "font-mono")}
          />
        </Field>

        <Field
          id="categoryId"
          label="Категория"
          error={err.categoryId}
          hint="Без категории товар в каталоге не отфильтруется"
        >
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ? String(product.categoryId) : ""}
            disabled={readOnly}
            className={input(err.categoryId)}
          >
            <option value="">Без категории</option>
            {categoryList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="unit" label="Единица измерения" error={err.unit}>
          <input
            id="unit"
            name="unit"
            defaultValue={product?.unit ?? "шт."}
            disabled={readOnly}
            className={input(err.unit)}
          />
        </Field>

        <Field id="minQuantity" label="Минимальный тираж" error={err.minQuantity}>
          <input
            id="minQuantity"
            name="minQuantity"
            type="number"
            min={1}
            defaultValue={product?.minQuantity ?? 1}
            disabled={readOnly}
            className={cn(input(err.minQuantity), "font-mono")}
          />
        </Field>

        <Field
          id="multiplicity"
          label="Кратность заказа"
          error={err.multiplicity}
          hint="1 - заказывать можно любым числом"
        >
          <input
            id="multiplicity"
            name="multiplicity"
            type="number"
            min={1}
            defaultValue={product?.multiplicity ?? 1}
            disabled={readOnly}
            className={cn(input(err.multiplicity), "font-mono")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-paper p-4">
        <Toggle
          name="isPopular"
          defaultChecked={product?.isPopular ?? false}
          disabled={readOnly}
          label="Популярный"
          hint="Поднимается в начало каталога и получает метку"
        />
        <Toggle
          name="isHidden"
          defaultChecked={product?.isHidden ?? false}
          disabled={readOnly}
          label="Скрыт с витрины"
          hint="Товар останется в базе и в старых заказах, но пропадёт из каталога"
        />
      </div>

      {!readOnly && (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : product ? "Сохранить" : "Завести товар"}
          </button>
        </div>
      )}
    </form>
  );
}

const input = (error?: string) =>
  cn(
    "w-full rounded-lg border bg-bone px-3 py-2 text-sm text-ink",
    "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink/50",
    error ? "border-danger" : "border-ink/15 hover:border-ink/30",
  );

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink/45">{hint}</p>
      ) : null}
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-brand disabled:cursor-not-allowed"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-ink/50">{hint}</span>
      </span>
    </label>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm",
        tone === "ok" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
      )}
    >
      {children}
    </p>
  );
}
