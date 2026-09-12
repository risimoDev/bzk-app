import { materialCostPerItem, type Shape } from "@/lib/cutting";

/** Настройки ценообразования из таблицы pricing_settings. */
export type PricingSettings = {
  markupPercent: number;
  overheadPercent: number;
  laborRatePerHour: number;
  roundingStep: number;
  minOrderPrice: number;
};

export const DEFAULT_SETTINGS: PricingSettings = {
  markupPercent: 50,
  overheadPercent: 15,
  laborRatePerHour: 500,
  roundingStep: 10,
  minOrderPrice: 500,
};

/** Собирает настройки из пар ключ-значение, недостающие берёт по умолчанию. */
export function readSettings(rows: { settingKey: string; settingValue: string }[]) {
  const map = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
  const num = (key: string, fallback: number) => {
    const v = Number(map.get(key));
    return Number.isFinite(v) ? v : fallback;
  };

  return {
    markupPercent: num("default_markup", DEFAULT_SETTINGS.markupPercent),
    overheadPercent: num("default_overhead", DEFAULT_SETTINGS.overheadPercent),
    laborRatePerHour: num("labor_rate_per_hour", DEFAULT_SETTINGS.laborRatePerHour),
    roundingStep: num("rounding_step", DEFAULT_SETTINGS.roundingStep),
    minOrderPrice: num("min_order_price", DEFAULT_SETTINGS.minOrderPrice),
  } satisfies PricingSettings;
}

export type CalcInput = {
  quantity: number;
  material: { widthMm: number; heightMm: number; costPerUnit: number; unit: string };
  item: {
    shape: Shape;
    widthMm?: number;
    heightMm?: number;
    diameterMm?: number;
    marginMm?: number;
  };
  /** Часы работы на весь тираж */
  laborHours: number;
  settings: PricingSettings;
};

/**
 * Расчёт себестоимости и цены тиража.
 *
 * Порядок как в старом калькуляторе: материал плюс работа дают прямую
 * себестоимость, на неё начисляются накладные, затем наценка. Округление
 * - вверх до шага, чтобы цена не оказалась ниже расчётной.
 */
export function calculatePrice(input: CalcInput) {
  const { quantity, material, item, laborHours, settings } = input;

  const perItem = materialCostPerItem(material, item);

  if (perItem.error) {
    // Явный признак вместо проверки наличия поля: с ним вызывающий код
    // не гадает, какие поля есть в этой ветке
    return { ok: false as const, error: perItem.error, cutting: perItem.cutting };
  }

  // Листы берутся целыми: полтора листа материала не купить
  const sheetsNeeded = Math.ceil(quantity / perItem.itemsPerSheet);
  const materialCost = +(sheetsNeeded * material.costPerUnit).toFixed(2);
  const laborCost = +(laborHours * settings.laborRatePerHour).toFixed(2);

  const direct = materialCost + laborCost;
  const overhead = +((direct * settings.overheadPercent) / 100).toFixed(2);
  const cost = +(direct + overhead).toFixed(2);

  const markup = +((cost * settings.markupPercent) / 100).toFixed(2);
  const raw = cost + markup;

  const step = settings.roundingStep > 0 ? settings.roundingStep : 1;
  const rounded = Math.ceil(raw / step) * step;
  const total = Math.max(rounded, settings.minOrderPrice);

  return {
    ok: true as const,
    cutting: perItem.cutting,
    itemsPerSheet: perItem.itemsPerSheet,
    sheetsNeeded,
    materialCost,
    laborCost,
    overhead,
    cost,
    markup,
    total,
    pricePerItem: +(total / quantity).toFixed(2),
    costPerItem: +(cost / quantity).toFixed(2),
    /** Цена упёрлась в минимальную сумму заказа, а не в расчёт */
    hitMinimum: total > rounded,
  };
}
