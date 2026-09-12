"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { calculatePrice, type PricingSettings } from "@/lib/pricing";
import type { Shape } from "@/lib/cutting";
import { cn } from "@/lib/cn";

type Material = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: number;
  widthMm: number;
  heightMm: number;
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/**
 * Калькулятор считает прямо в браузере: расчёт чистый, без обращений
 * к базе, и менеджеру удобнее подбирать параметры без перезагрузки
 * страницы на каждое изменение.
 */
export function CalculatorForm({
  materials,
  settings,
}: {
  materials: Material[];
  settings: PricingSettings;
}) {
  // 0 - «свой материал»: размеры листа и цена вводятся руками.
  // Пока у материалов в базе не заполнены размеры, это единственный
  // способ посчитать раскрой, поэтому он выбран по умолчанию.
  const [materialId, setMaterialId] = useState(0);
  const [ownWidth, setOwnWidth] = useState(320);
  const [ownHeight, setOwnHeight] = useState(450);
  const [ownCost, setOwnCost] = useState(12);
  const [shape, setShape] = useState<Shape>("rectangle");
  const [quantity, setQuantity] = useState(100);
  const [width, setWidth] = useState(90);
  const [height, setHeight] = useState(50);
  const [diameter, setDiameter] = useState(50);
  const [margin, setMargin] = useState(2);
  const [laborHours, setLaborHours] = useState(1);

  // Мемоизируем: для «своего материала» объект пересобирается на каждый
  // рендер, и без этого расчёт ниже пересчитывался бы вхолостую
  const material = useMemo(
    () =>
      materialId === 0
        ? {
            id: 0,
            name: "Свой материал",
            unit: "лист",
            costPerUnit: ownCost,
            widthMm: ownWidth,
            heightMm: ownHeight,
          }
        : materials.find((m) => m.id === materialId),
    [materialId, ownCost, ownWidth, ownHeight, materials],
  );

  const result = useMemo(() => {
    if (!material || quantity <= 0) return null;
    return calculatePrice({
      quantity,
      material,
      item: {
        shape,
        widthMm: width,
        heightMm: height,
        diameterMm: diameter,
        marginMm: margin,
      },
      laborHours,
      settings,
    });
  }, [
    material,
    quantity,
    shape,
    width,
    height,
    diameter,
    margin,
    laborHours,
    settings,
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
      {/* ---------- Ввод ---------- */}
      <section className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-bone p-5">
        <Field label="Материал" htmlFor="material">
          <select
            id="material"
            value={materialId}
            onChange={(e) => setMaterialId(Number(e.target.value))}
            className={input}
          >
            <option value={0}>Свой материал - задать вручную</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} - {num.format(m.widthMm)}×{num.format(m.heightMm)} мм
              </option>
            ))}
          </select>
        </Field>

        {materialId === 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Лист, ширина" htmlFor="ownWidth">
              <input
                id="ownWidth"
                type="number"
                min={1}
                value={ownWidth}
                onChange={(e) => setOwnWidth(Number(e.target.value))}
                className={cn(input, "font-mono")}
              />
            </Field>
            <Field label="Лист, высота" htmlFor="ownHeight">
              <input
                id="ownHeight"
                type="number"
                min={1}
                value={ownHeight}
                onChange={(e) => setOwnHeight(Number(e.target.value))}
                className={cn(input, "font-mono")}
              />
            </Field>
            <Field label="Цена листа, ₽" htmlFor="ownCost">
              <input
                id="ownCost"
                type="number"
                min={0}
                step={0.01}
                value={ownCost}
                onChange={(e) => setOwnCost(Number(e.target.value))}
                className={cn(input, "font-mono")}
              />
            </Field>
          </div>
        ) : (
          material && (
            <p className="-mt-2 text-xs text-ink/45">
              {money.format(material.costPerUnit)} за {material.unit}
            </p>
          )
        )}

        <Field label="Форма изделия" htmlFor="shape">
          <select
            id="shape"
            value={shape}
            onChange={(e) => setShape(e.target.value as Shape)}
            className={input}
          >
            <option value="rectangle">Прямоугольник</option>
            <option value="circle">Круг</option>
          </select>
        </Field>

        {shape === "circle" ? (
          <Field label="Диаметр, мм" htmlFor="diameter">
            <input
              id="diameter"
              type="number"
              min={1}
              value={diameter}
              onChange={(e) => setDiameter(Number(e.target.value))}
              className={cn(input, "font-mono")}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ширина, мм" htmlFor="width">
              <input
                id="width"
                type="number"
                min={1}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className={cn(input, "font-mono")}
              />
            </Field>
            <Field label="Высота, мм" htmlFor="height">
              <input
                id="height"
                type="number"
                min={1}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className={cn(input, "font-mono")}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Отступ на рез, мм" htmlFor="margin">
            <input
              id="margin"
              type="number"
              min={0}
              step={0.5}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className={cn(input, "font-mono")}
            />
          </Field>
          <Field label="Тираж" htmlFor="quantity">
            <input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className={cn(input, "font-mono")}
            />
          </Field>
        </div>

        <Field label="Работа, часов на тираж" htmlFor="labor">
          <input
            id="labor"
            type="number"
            min={0}
            step={0.5}
            value={laborHours}
            onChange={(e) => setLaborHours(Number(e.target.value))}
            className={cn(input, "font-mono")}
          />
        </Field>

        <dl className="mt-2 flex flex-col gap-1 border-t border-ink/10 pt-3 text-xs text-ink/50">
          <Row label="Ставка часа" value={money.format(settings.laborRatePerHour)} />
          <Row label="Накладные" value={`${settings.overheadPercent}%`} />
          <Row label="Наценка" value={`${settings.markupPercent}%`} />
          <Row label="Округление" value={`до ${settings.roundingStep} ₽`} />
          <Row label="Минимум заказа" value={money.format(settings.minOrderPrice)} />
        </dl>
      </section>

      {/* ---------- Результат ---------- */}
      <section className="flex flex-col gap-4">
        {!result ? (
          <p className="rounded-xl border border-ink/10 bg-bone p-6 text-ink/50">
            Заполните параметры расчёта.
          </p>
        ) : !result.ok ? (
          <p className="flex items-start gap-2.5 rounded-xl bg-warn/10 px-5 py-4 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.error}. Проверьте размеры изделия и материала.
          </p>
        ) : (
          (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Цена тиража"
                  value={money.format(result.total)}
                  accent
                />
                <Stat label="Цена за изделие" value={money.format(result.pricePerItem)} />
                <Stat
                  label="Себестоимость изделия"
                  value={money.format(result.costPerItem)}
                />
              </div>

              {result.hitMinimum && (
                <p className="rounded-lg bg-navy/10 px-4 py-2.5 text-sm text-navy">
                  Цена поднята до минимальной суммы заказа -{" "}
                  {money.format(settings.minOrderPrice)}.
                </p>
              )}

              <div className="rounded-xl border border-ink/10 bg-bone p-5">
                <h3 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                  Раскрой
                </h3>
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row label="На листе помещается" value={`${result.itemsPerSheet} шт`} big />
                  <Row label="Листов на тираж" value={`${result.sheetsNeeded}`} big />
                  <Row
                    label="Использование листа"
                    value={`${result.cutting.efficiency}%`}
                    big
                  />
                  <Row label="Отходы" value={`${result.cutting.waste}%`} big />
                  {result.cutting.rows !== undefined && (
                    <Row
                      label="Раскладка"
                      value={`${result.cutting.cols} × ${result.cutting.rows}${
                        result.cutting.rotated ? ", с поворотом" : ""
                      }`}
                      big
                    />
                  )}
                  {result.cutting.layout && (
                    <Row
                      label="Укладка"
                      value={
                        result.cutting.layout === "hex" ? "шахматная" : "сетка"
                      }
                      big
                    />
                  )}
                </dl>
              </div>

              <div className="rounded-xl border border-ink/10 bg-bone p-5">
                <h3 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                  Из чего складывается
                </h3>
                <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                  <Row label="Материал" value={money.format(result.materialCost)} big />
                  <Row label="Работа" value={money.format(result.laborCost)} big />
                  <Row
                    label={`Накладные ${settings.overheadPercent}%`}
                    value={money.format(result.overhead)}
                    big
                  />
                  <div className="mt-1 border-t border-ink/10 pt-2">
                    <Row label="Себестоимость" value={money.format(result.cost)} big />
                  </div>
                  <Row
                    label={`Наценка ${settings.markupPercent}%`}
                    value={money.format(result.markup)}
                    big
                  />
                  <div className="mt-1 border-t border-ink/10 pt-2">
                    <Row label="Итого" value={money.format(result.total)} big accent />
                  </div>
                </dl>
              </div>
            </>
          )
        )}
      </section>
    </div>
  );
}

const input =
  "w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn(big ? "text-ink/55" : "")}>{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          big ? "text-ink" : "",
          accent && "text-brand",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
      <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl tabular-nums",
          accent ? "text-brand" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
