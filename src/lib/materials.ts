/** Категории материалов и типы движений - подписи для админки. */

export type MaterialCategory =
  | "paper"
  | "vinyl"
  | "banner"
  | "film"
  | "ink"
  | "lamination"
  | "other";

export const CATEGORY: Record<MaterialCategory, string> = {
  paper: "Бумага",
  vinyl: "Плёнка винил",
  banner: "Баннерная ткань",
  film: "Плёнка",
  ink: "Краска",
  lamination: "Ламинация",
  other: "Прочее",
};

export const categoryOf = (v: string | null) =>
  CATEGORY[(v ?? "other") as MaterialCategory] ?? CATEGORY.other;

/**
 * Уровень остатка относительно минимального.
 *
 * Красный - уже ниже минимума, жёлтый - близко к нему. Порог в 20%
 * сверх минимума даёт время заказать, а не узнать о нехватке в момент,
 * когда материал уже кончился.
 */
export function stockLevel(quantity: number, minStock: number) {
  if (minStock <= 0) {
    return quantity <= 0
      ? { label: "Нет в наличии", className: "text-danger", tone: "danger" as const }
      : { label: "В наличии", className: "text-ink/60", tone: "ok" as const };
  }
  if (quantity <= 0) {
    return { label: "Закончился", className: "text-danger", tone: "danger" as const };
  }
  if (quantity < minStock) {
    return { label: "Ниже минимума", className: "text-danger", tone: "danger" as const };
  }
  if (quantity < minStock * 1.2) {
    return { label: "На исходе", className: "text-warn", tone: "warn" as const };
  }
  return { label: "В наличии", className: "text-ink/60", tone: "ok" as const };
}

export const MOVEMENT_TYPE = {
  in: { label: "Приход", className: "text-ok" },
  out: { label: "Расход", className: "text-danger" },
} as const;

export const REFERENCE_TYPE = {
  order: "По заказу",
  manual: "Вручную",
} as const;
