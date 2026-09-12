"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Plus, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  saveAttribute,
  deleteAttribute,
  saveAttributeValue,
  deleteAttributeValue,
  type AttributeState,
} from "../attribute-actions";
import { cn } from "@/lib/cn";

export type AttributeRow = {
  id: number;
  name: string;
  values: { id: number; value: string; priceModifier: string | null }[];
};

const initial: AttributeState = {};

const inputClass =
  "rounded-lg border border-ink/15 bg-bone px-3 py-1.5 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright disabled:bg-paper disabled:text-ink/50";
const saveClass =
  "rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/60 hover:border-brand/40 hover:text-brand disabled:opacity-50";
const deleteClass =
  "rounded p-1.5 text-ink/30 hover:bg-danger/10 hover:text-danger disabled:opacity-50";

/**
 * Характеристики товара: «Бумага: мелованная / дизайнерская +2 ₽».
 *
 * В карточке каждая характеристика - ряд переключателей, первое значение
 * выбрано по умолчанию. Поэтому первым стоит заводить базовый вариант
 * без надбавки: иначе клиент увидит завышенную цену, ничего не выбрав.
 */
export function AttributesEditor({
  productId,
  attributes,
  readOnly,
}: {
  productId: number;
  attributes: AttributeRow[];
  readOnly: boolean;
}) {
  return (
    <section className="rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
      <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
        ХАРАКТЕРИСТИКИ
      </h2>
      <p className="mt-1 max-w-2xl text-xs text-ink/50">
        Клиент выбирает их в карточке товара. Надбавка прибавляется к цене за единицу, минус -
        скидка. Первое значение выбрано по умолчанию, поэтому первым ставьте базовый вариант
        без надбавки.
      </p>

      {attributes.length === 0 && (
        <p className="mt-4 rounded-lg bg-paper px-4 py-3 text-sm text-ink/50">
          Характеристик нет - в карточке товара будет только количество.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {attributes.map((attr) => (
          <div key={attr.id} className="rounded-lg border border-ink/10 bg-paper/60 p-4">
            {readOnly ? (
              <p className="text-sm text-ink">{attr.name}</p>
            ) : (
              <AttributeNameForm productId={productId} attr={attr} />
            )}

            <ul className="mt-3 flex flex-col gap-1.5">
              {attr.values.map((v) =>
                readOnly ? (
                  <li key={v.id} className="flex justify-between text-sm text-ink/70">
                    <span>{v.value}</span>
                    <span className="font-mono text-xs">{formatModifier(v.priceModifier)}</span>
                  </li>
                ) : (
                  <li key={v.id}>
                    <ValueForm productId={productId} attributeId={attr.id} value={v} />
                  </li>
                ),
              )}
            </ul>

            {!readOnly && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <p className="mb-1.5 font-display text-[0.58rem] tracking-[0.14em] text-ink/40">
                  НОВОЕ ЗНАЧЕНИЕ
                </p>
                <ValueForm productId={productId} attributeId={attr.id} />
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && <NewAttributeForm productId={productId} />}
    </section>
  );
}

function formatModifier(value: string | null) {
  const n = Number(value ?? 0);
  if (!n) return "без надбавки";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(2)} ₽`;
}

function AttributeNameForm({ productId, attr }: { productId: number; attr: AttributeRow }) {
  const [state, action, pending] = useActionState(saveAttribute, initial);
  const [del, deleteAction, deleting] = useActionState(deleteAttribute, initial);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="id" value={attr.id} />
        <input
          name="name"
          defaultValue={attr.name}
          maxLength={255}
          aria-label="Название характеристики"
          className={cn(inputClass, "min-w-40 flex-1 font-medium")}
        />
        <button type="submit" disabled={pending} className={saveClass}>
          {pending ? "…" : "СОХРАНИТЬ"}
        </button>
        <Status state={state} />
      </form>

      <form action={deleteAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="id" value={attr.id} />
        <ConfirmButton
          title={`Удалить характеристику «${attr.name}»?`}
          text="Пропадут и все её значения. У клиентов, которые уже положили товар в корзину, надбавка перестанет считаться."
          disabled={deleting}
          ariaLabel="Удалить характеристику"
          className={deleteClass}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </ConfirmButton>
      </form>
      {del.error && <span className="text-xs text-danger">{del.error}</span>}
    </div>
  );
}

function ValueForm({
  productId,
  attributeId,
  value,
}: {
  productId: number;
  attributeId: number;
  value?: { id: number; value: string; priceModifier: string | null };
}) {
  const [state, action, pending] = useActionState(saveAttributeValue, initial);
  const [del, deleteAction, deleting] = useActionState(deleteAttributeValue, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Форма нового значения после сохранения очищается: иначе следующее
  // значение пришлось бы вписывать поверх только что заведённого
  useEffect(() => {
    if (state.ok && !value) formRef.current?.reset();
  }, [state, value]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form ref={formRef} action={action} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="attributeId" value={attributeId} />
        {value && <input type="hidden" name="id" value={value.id} />}
        <input
          name="value"
          defaultValue={value?.value ?? ""}
          maxLength={255}
          placeholder="Значение"
          aria-label="Значение"
          className={cn(inputClass, "min-w-32 flex-1")}
        />
        <input
          name="priceModifier"
          defaultValue={value && Number(value.priceModifier ?? 0) !== 0 ? value.priceModifier ?? "" : ""}
          inputMode="decimal"
          placeholder="+0.00 ₽"
          aria-label="Надбавка к цене за единицу, ₽"
          className={cn(inputClass, "w-24 font-mono")}
        />
        <button type="submit" disabled={pending} className={saveClass}>
          {pending ? "…" : value ? "СОХРАНИТЬ" : (
            <span className="flex items-center gap-1">
              <Plus className="size-3" aria-hidden />
              ДОБАВИТЬ
            </span>
          )}
        </button>
        <Status state={state} />
      </form>

      {value && (
        <form action={deleteAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="attributeId" value={attributeId} />
          <input type="hidden" name="id" value={value.id} />
          <ConfirmButton
            title={`Удалить значение «${value.value}»?`}
            text="Оно пропадёт из выбора в карточке товара."
            disabled={deleting}
            ariaLabel="Удалить значение"
            className={deleteClass}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </ConfirmButton>
        </form>
      )}
      {del.error && <span className="text-xs text-danger">{del.error}</span>}
    </div>
  );
}

function NewAttributeForm({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(saveAttribute, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4"
    >
      <input type="hidden" name="productId" value={productId} />
      <input
        name="name"
        maxLength={255}
        placeholder="Новая характеристика: Бумага, Ламинация, Углы…"
        aria-label="Название новой характеристики"
        className={cn(inputClass, "min-w-64 flex-1 sm:max-w-md")}
      />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
      >
        <Plus className="size-3.5" aria-hidden />
        {pending ? "Добавляю…" : "Добавить характеристику"}
      </button>
      <Status state={state} />
    </form>
  );
}

function Status({ state }: { state: AttributeState }) {
  const text = state.error ?? (state.ok ? state.message : undefined);
  if (!text) return null;
  return (
    <span
      role="status"
      className={cn("flex items-center gap-1 text-xs", state.error ? "text-danger" : "text-ok")}
    >
      {state.error ? (
        <TriangleAlert className="size-3.5" aria-hidden />
      ) : (
        <Check className="size-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}
