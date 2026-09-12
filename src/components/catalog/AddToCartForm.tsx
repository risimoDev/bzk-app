"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { addToCart } from "@/app/actions/cart";
import { Button } from "@/components/ui/Button";
import { normalizeQuantity, unitPriceFor, type PriceTier } from "@/lib/product-price";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat("ru-RU");

type Option = { valueId: number; value: string; priceModifier: string | null };

/**
 * Выбор характеристик и количества с расчётом суммы.
 *
 * Сумма считается прямо в браузере той же формулой, что и корзина
 * (`lib/product-price.ts`), поэтому цифра до «В корзину» и после
 * совпадают. Решающий расчёт всё равно делает сервер - здесь только
 * подсказка, отправляется обычная форма.
 *
 * Первое значение каждой характеристики отмечено по умолчанию, иначе
 * можно было бы отправить заказ без выбора, и цена оказалась бы не той,
 * что видел клиент.
 */
export function AddToCartForm({
  productId,
  unit,
  basePrice,
  tiers,
  minQuantity,
  multiplicity,
  attributes,
}: {
  productId: number;
  unit: string;
  basePrice: string;
  tiers: PriceTier[];
  minQuantity: number;
  multiplicity: number;
  attributes: { name: string; values: Option[] }[];
}) {
  const [quantityInput, setQuantityInput] = useState(String(minQuantity));
  const [selected, setSelected] = useState<number[]>(() =>
    attributes.map((a) => a.values[0]?.valueId ?? 0),
  );

  const surcharge = attributes.reduce((sum, attr, i) => {
    const value = attr.values.find((v) => v.valueId === selected[i]);
    return sum + Number(value?.priceModifier ?? 0);
  }, 0);

  const quantity = normalizeQuantity(Number(quantityInput), minQuantity, multiplicity);
  const unitPrice = unitPriceFor({ basePrice, tiers, quantity, surcharge });
  const total = unitPrice * quantity;
  const adjusted = quantityInput.trim() !== "" && Number(quantityInput) !== quantity;

  // Подсказка про следующую ступень: «от 500 шт. - дешевле». Показываем,
  // только если там действительно дешевле, а не просто другой диапазон
  const nextTier = tiers
    .filter((t) => t.minQty > quantity)
    .sort((a, b) => a.minQty - b.minQty)[0];
  const nextUnitPrice = nextTier
    ? unitPriceFor({ basePrice, tiers, quantity: nextTier.minQty, surcharge })
    : null;

  return (
    <form action={addToCart} className="mt-8 flex flex-col gap-6">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="minQuantity" value={minQuantity} />
      <input type="hidden" name="multiplicity" value={multiplicity} />

      {attributes.map((attr, attrIndex) => (
        <fieldset key={attr.name} className="border-0 p-0">
          <legend className="font-display text-xs tracking-[0.16em] text-ink/45">
            {attr.name}
          </legend>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {attr.values.map((v) => {
              const mod = Number(v.priceModifier ?? 0);
              const id = `attr-${v.valueId}`;
              return (
                <div key={v.valueId}>
                  {/* peer + label: доступный переключатель - radio
                      остаётся в потоке, но визуально скрыт.

                      Имя у каждой характеристики своё: radio с общим
                      именем образуют ОДНУ группу, и выбрать удалось бы
                      лишь одно значение на весь товар. */}
                  <input
                    type="radio"
                    id={id}
                    name={`attr-${attrIndex}`}
                    value={String(v.valueId)}
                    checked={selected[attrIndex] === v.valueId}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.map((s, i) => (i === attrIndex ? v.valueId : s)),
                      )
                    }
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={id}
                    className="inline-block cursor-pointer rounded-pill border border-ink/15 px-3.5 py-1.5 text-sm text-ink/75 transition-colors hover:border-brand/50 peer-checked:border-brand peer-checked:bg-brand peer-checked:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-bright"
                  >
                    {v.value}
                    {mod !== 0 && (
                      <span className="ml-1.5 font-mono text-xs opacity-70">
                        {mod > 0 ? "+" : "−"}
                        {money.format(Math.abs(mod))}
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="quantity"
            className="font-display text-xs tracking-[0.16em] text-ink/45"
          >
            Количество, {unit}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={minQuantity}
            step={multiplicity}
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            // Уходя из поля, показываем то число, которое реально уйдёт
            // в корзину: так «150» при продаже сотнями не станет сюрпризом
            onBlur={() => setQuantityInput(String(quantity))}
            className="w-36 rounded-xl border border-ink/15 bg-bone px-4 py-3 font-mono text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>

        <Button type="submit" size="lg">
          <ShoppingBag className="size-5" />
          В корзину
        </Button>
      </div>

      <div
        aria-live="polite"
        className="rounded-card border border-ink/10 bg-bone/80 px-5 py-4"
      >
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-display text-xs tracking-[0.16em] text-ink/45">
            ИТОГО ЗА {count.format(quantity)} {unit.toUpperCase()}
          </span>
          <span className="font-mono text-2xl tabular-nums text-ink">
            {money.format(total)}
          </span>
        </p>
        <p className="mt-1 text-sm text-ink/55">
          {money.format(unitPrice)} за {unit}
          {adjusted &&
            (multiplicity > 1
              ? ` · заказ кратен ${multiplicity}, посчитали ${count.format(quantity)}`
              : ` · минимум ${count.format(minQuantity)}`)}
        </p>
        {nextTier && nextUnitPrice !== null && nextUnitPrice < unitPrice && (
          <p className="mt-2 text-sm text-brand">
            От {count.format(nextTier.minQty)} {unit} - {money.format(nextUnitPrice)} за{" "}
            {unit}
          </p>
        )}
      </div>

      <p className="text-sm text-ink/50">
        {multiplicity > 1
          ? `Заказ кратен ${multiplicity} ${unit}, минимум - ${minQuantity}.`
          : `Минимальный заказ - ${minQuantity} ${unit}.`}{" "}
        Окончательную сумму подтвердит менеджер, когда посмотрит макет.
      </p>
    </form>
  );
}
