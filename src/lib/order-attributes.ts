/**
 * Атрибуты позиции заказа для показа.
 *
 * В `order_items.attributes` лежат два формата. Новый пишет оформление:
 * массив `[{ attribute, value, modifier }]` - с надбавкой, из которой
 * сложена цена. Старый пришёл с перенесённых заказов: объект
 * `{ ключ: значение }` без надбавок. Страницы не должны знать про оба,
 * поэтому разбор один и чистый - без базы, чтобы его проверял скрипт.
 */

export type OrderAttribute = {
  name: string;
  value: string;
  /** Надбавка к цене за единицу; 0, если её нет */
  modifier: number;
};

export function parseOrderAttributes(raw: unknown): OrderAttribute[] {
  if (Array.isArray(raw)) {
    const out: OrderAttribute[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const name = text(r.attribute ?? r.name);
      const value = text(r.value);
      if (!name && !value) continue;
      const modifier = Number(r.modifier ?? 0);
      out.push({ name, value, modifier: Number.isFinite(modifier) ? modifier : 0 });
    }
    return out;
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([k, v]) => ({ name: k, value: text(v), modifier: 0 }))
      .filter((a) => a.value !== "");
  }

  return [];
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });

/** «Цвет: Белый» или «Материал: Лён (+3,00 ₽)». */
export function formatOrderAttribute(a: OrderAttribute): string {
  const base = a.name ? `${a.name}: ${a.value}` : a.value;
  if (a.modifier === 0) return base;
  const sign = a.modifier > 0 ? "+" : "−";
  return `${base} (${sign}${rub.format(Math.abs(a.modifier))})`;
}
