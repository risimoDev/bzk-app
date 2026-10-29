"use client";

import { useMemo, useState } from "react";
import { catalogTierOptions } from "@/lib/tier-upsell";
import type { PriceTier } from "@/lib/product-price";
import { cn } from "@/lib/cn";

// Дробные цены (3,2 ₽ за листовку) нельзя округлять до рубля, иначе на
// карточке будет «3 ₽», а в корзине 3,2
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat("ru-RU");

/**
 * Цена на карточке каталога с переключателем тиража.
 *
 * Сетка каталога остаётся серверной, а сюда приходят лишь ступени одного
 * товара - несколько чисел. Цена пересчитывается в браузере теми же
 * функциями, что корзина (`lib/product-price.ts`), без запросов.
 *
 * Кнопки лежат поверх «растянутой» ссылки карточки (z-10 над её слоем):
 * вложить кнопку внутрь `<a>` нельзя, а клик по ней не должен открывать
 * товар. Первый тираж - минимальный, и пока выбран он, подпись «от», как
 * у товара без ступеней.
 */
export function CatalogPrice({
  unit,
  basePrice,
  tiers,
  minQuantity,
  multiplicity,
  surcharge = 0,
}: {
  unit: string;
  basePrice: string | null;
  tiers: PriceTier[];
  minQuantity: number;
  multiplicity: number;
  /** Надбавка исполнения по умолчанию - та, что выбрана в форме товара. */
  surcharge?: number;
}) {
  const options = useMemo(
    () =>
      catalogTierOptions({
        basePrice: basePrice ?? 0,
        tiers,
        minQuantity,
        multiplicity,
        surcharge,
        limit: 3,
      }),
    [basePrice, tiers, minQuantity, multiplicity, surcharge],
  );
  const [index, setIndex] = useState(0);
  const current = options[Math.min(index, options.length - 1)];

  if (!current || current.unitPrice <= 0) {
    return <span className="text-base text-ink/50">Цена по запросу</span>;
  }

  const isFirst = current === options[0];

  return (
    <>
      <span className="block">
        {isFirst && <span className="text-sm text-ink/45">от </span>}
        {money.format(current.unitPrice)}
        <span className="text-sm text-ink/45"> / {unit}</span>
      </span>

      {options.length > 1 && (
        <>
          <span className="mt-0.5 block text-xs text-ink/50">
            {count.format(current.quantity)} {unit} - {money.format(current.total)}
          </span>
          <span
            role="group"
            aria-label="Тираж"
            className="mt-2.5 flex flex-wrap gap-1.5"
          >
            {options.map((o, i) => (
              <button
                key={o.quantity}
                type="button"
                aria-pressed={o === current}
                aria-label={`Тираж ${count.format(o.quantity)} ${unit}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "relative z-10 min-h-9 rounded-pill border px-3 font-mono text-xs transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-bright",
                  o === current
                    ? "border-brand bg-brand text-bone"
                    : "border-ink/15 bg-bone text-ink/70 hover:border-brand/50 hover:text-brand",
                )}
              >
                {count.format(o.quantity)}
              </button>
            ))}
          </span>
        </>
      )}
    </>
  );
}
