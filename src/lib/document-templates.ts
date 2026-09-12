/**
 * Шаблоны документов: разбор схемы полей.
 *
 * Схема хранится JSON-ом и пишется руками в редакторе шаблона. Ошибка в
 * ней не видна до того дня, когда по шаблону начнут выпускать документ,
 * поэтому проверяем при сохранении и говорим, что именно не так.
 *
 * Здесь нет базы - файл подключают и серверное действие, и проверочный
 * скрипт.
 */

export type TemplateField = {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
};

export type ParsedFields =
  | { ok: true; value: { fields: TemplateField[] } | null }
  | { ok: false; error: string };

/** Пусто - схемы нет. Иначе нужен объект `{ "fields": [ { "name": … } ] }`. */
export function parseFieldsSchema(raw: string): ParsedFields {
  if (raw.trim() === "") return { ok: true, value: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Схема полей - не JSON. Проверьте запятые и кавычки" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: 'Нужен объект с массивом полей: {"fields": [...]}' };
  }

  const fields = (parsed as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) {
    return { ok: false, error: 'В схеме нет массива fields: {"fields": [...]}' };
  }

  const names = new Set<string>();
  const out: TemplateField[] = [];

  for (const [i, f] of fields.entries()) {
    const o = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
    const name = typeof o?.name === "string" ? o.name.trim() : "";
    if (!o || name === "") return { ok: false, error: `У поля № ${i + 1} нет имени (name)` };
    // Имена полей в перенесённых шаблонах - латиницей, как их
    // плейсхолдеры {{client_name}} в разметке. Держим тот же порядок,
    // чтобы новые шаблоны не расходились со старыми
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return {
        ok: false,
        error: `Имя поля «${name}» - только латиница, цифры и подчёркивание`,
      };
    }
    if (names.has(name)) return { ok: false, error: `Поле «${name}» встречается дважды` };
    names.add(name);

    out.push({
      name,
      type: typeof o.type === "string" && o.type ? o.type : "text",
      ...(typeof o.label === "string" && o.label ? { label: o.label } : {}),
      ...(o.required === true ? { required: true } : {}),
    });
  }

  return { ok: true, value: { fields: out } };
}

/**
 * Значение поля документа: строка, число или таблица позиций.
 *
 * Таблица - массив строк вида `{ name, quantity, price, unit }`, как её
 * заполняли на старом сайте (тип поля `items_table`).
 */
export type FieldValue = string | number | ItemRow[];
export type ItemRow = { name?: string; quantity?: number; price?: number; unit?: string };

/** Экранирование значения перед вставкой в HTML документа. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const money = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("ru-RU");

/**
 * Таблица позиций в HTML.
 *
 * Перенос `renderItemsTable()` из includes/documents.php: те же колонки и
 * итог. Классы совпадают с теми, что уже стилизованы в печатных формах.
 */
export function renderItemsTable(items: ItemRow[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="no-items-notice">Позиции не указаны</div>';
  }

  let subtotal = 0;
  const rows = items
    .map((item, i) => {
      const qty = Number(item.quantity ?? 1) || 0;
      const price = Number(item.price ?? 0) || 0;
      const sum = qty * price;
      subtotal += sum;
      return (
        `<tr><td>${i + 1}</td>` +
        `<td>${escapeHtml(String(item.name ?? "Позиция"))}</td>` +
        `<td>${qtyFmt.format(qty)}</td>` +
        `<td>${escapeHtml(String(item.unit ?? "шт."))}</td>` +
        `<td class="text-right">${money.format(price)}</td>` +
        `<td class="text-right">${money.format(sum)}</td></tr>`
      );
    })
    .join("");

  return (
    '<table class="items-table"><thead><tr>' +
    "<th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th>" +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="items-totals-simple"><div><strong>Итого: ${money.format(subtotal)} ₽</strong></div>` +
    `<div>Всего наименований: ${items.length}</div></div>`
  );
}

/**
 * Подставляет значения полей в шаблон.
 *
 * `{{имя}}` заменяется на экранированное значение (таблицы - на готовый
 * HTML таблицы), незаполненные плейсхолдеры убираются. Так же работал
 * `renderDocumentTemplate()` старого сайта. Результат всё равно проходит
 * через белый список тегов при показе - двойная защита не мешает.
 */
export function renderTemplate(html: string, values: Record<string, FieldValue>): string {
  let out = html;

  for (const [key, value] of Object.entries(values)) {
    const placeholder = new RegExp(`\{\{\s*${key}\s*\}\}`, "g");
    const rendered = Array.isArray(value)
      ? renderItemsTable(value)
      : escapeHtml(String(value ?? ""));
    out = out.replace(placeholder, rendered);
  }

  // Остатки незаполненных плейсхолдеров убираем, чтобы в документе не
  // торчали фигурные скобки
  return out.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, "");
}
