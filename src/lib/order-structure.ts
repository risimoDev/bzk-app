/**
 * Позиции заказа менеджера по видам работ и маржа по блокам.
 *
 * Зачем: «печать» мы делаем сами, «конструкции», «монтаж» часто
 * перезаказываем, и общая маржа заказа не говорит, где заработали, а где
 * только перепродали. Модуль чистый: его подключают и карточка заказа,
 * и аналитика, и проверочный скрипт.
 */

export const ITEM_CATEGORY = {
  print: { label: "Печать" },
  structures: { label: "Конструкции и материалы" },
  design: { label: "Дизайн" },
  installation: { label: "Монтаж" },
  delivery: { label: "Доставка и техника" },
  other: { label: "Прочее" },
} as const;

export type ItemCategory = keyof typeof ITEM_CATEGORY;

/** Порядок показа - как в форме позиции. */
export const ITEM_CATEGORY_ORDER = Object.keys(ITEM_CATEGORY) as ItemCategory[];

export const DEFAULT_ITEM_CATEGORY: ItemCategory = "print";

/** Известная категория или «печать»: неизвестное значение не повод падать. */
export function itemCategoryOf(raw: unknown): ItemCategory {
  return typeof raw === "string" && Object.hasOwn(ITEM_CATEGORY, raw)
    ? (raw as ItemCategory)
    : DEFAULT_ITEM_CATEGORY;
}

const kop = (v: number | string) => Math.round(Number(v) * 100);

export type StructureLine = {
  category: ItemCategory;
  /** Сколько позиций. */
  count: number;
  /** Выручка по позициям (price - сумма строки). */
  revenue: number;
  /** Расход по позициям (expense_amount - сумма строки). */
  expense: number;
};

export type StructureRow = StructureLine & {
  margin: number;
  /** Маржа в % от выручки; null, когда выручки нет. */
  marginPct: number | null;
};

export type OrderStructure = {
  rows: StructureRow[];
  /**
   * Корректировка заказа целиком - итог минус сумма позиций. Скидка или
   * наценка не размазывается по категориям: иначе они показали бы маржу,
   * которой на самом деле не было.
   */
  adjustment: number;
  total: StructureRow;
};

/** Маржа в процентах от выручки с одним знаком после запятой. */
export function marginPct(revenue: number, margin: number): number | null {
  if (revenue <= 0) return null;
  return Math.round((margin / revenue) * 1000) / 10;
}

function row(line: StructureLine): StructureRow {
  const margin = (kop(line.revenue) - kop(line.expense)) / 100;
  return { ...line, margin, marginPct: marginPct(line.revenue, margin) };
}

/**
 * Складывает позиции по категориям. Копейки считаются целыми, чтобы сумма
 * по категориям сходилась с суммой позиций до копейки.
 */
export function sumByCategory(
  items: { category: unknown; price: number | string; expense: number | string }[],
): StructureLine[] {
  const acc = new Map<ItemCategory, { count: number; revenue: number; expense: number }>();
  for (const i of items) {
    const key = itemCategoryOf(i.category);
    const cur = acc.get(key) ?? { count: 0, revenue: 0, expense: 0 };
    cur.count += 1;
    cur.revenue += kop(i.price);
    cur.expense += kop(i.expense);
    acc.set(key, cur);
  }
  return ITEM_CATEGORY_ORDER.filter((c) => acc.has(c)).map((category) => {
    const v = acc.get(category)!;
    return { category, count: v.count, revenue: v.revenue / 100, expense: v.expense / 100 };
  });
}

/**
 * Структура заказа: строки по категориям, корректировка отдельной
 * строкой и итог, равный итогу заказа.
 *
 * Корректировка считается как «итог минус позиции», а не берётся из
 * поля adjustment: у перенесённых заказов итог бывает записан иначе, и
 * тогда разница честно видна в этой строке, а таблица всё равно сходится
 * с итогом заказа.
 */
export function buildStructure(lines: StructureLine[], orderTotal: number | string): OrderStructure {
  const itemsRevenue = lines.reduce((s, l) => s + kop(l.revenue), 0);
  const expense = lines.reduce((s, l) => s + kop(l.expense), 0);
  const count = lines.reduce((s, l) => s + l.count, 0);
  const totalKop = kop(orderTotal);

  return {
    rows: lines.map(row),
    adjustment: (totalKop - itemsRevenue) / 100,
    total: row({
      category: DEFAULT_ITEM_CATEGORY,
      count,
      revenue: totalKop / 100,
      expense: expense / 100,
    }),
  };
}
