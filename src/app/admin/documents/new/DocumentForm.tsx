"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { createDocument, type DocumentState } from "@/app/actions/documents";
import { DOC_STATUS, DOC_TYPE } from "@/lib/documents-meta";
import { parseFieldsSchema, type TemplateField } from "@/lib/document-templates";
import { cn } from "@/lib/cn";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

const initial: DocumentState = {};

export type TemplateOption = {
  id: number;
  name: string;
  prefix: string | null;
  categoryId: number | null;
  contentTemplate: string | null;
  fieldsSchema: unknown;
};

export type CategoryOption = { id: number; name: string };
export type ClientOption = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  inn: string | null;
};
export type OrderOption = { id: number; clientName: string | null };

type ItemRow = { name: string; quantity: string; price: string; unit: string };

/**
 * Новый документ.
 *
 * Если у шаблона есть схема полей, форма рисует эти поля, а сервер
 * подставляет их значения в плейсхолдеры `{{имя}}` тела шаблона. Так
 * менеджер заполняет счёт или акт по клеточкам, а не правит HTML руками.
 * Ручной текст в самом низу перекрывает шаблон - на случай особого документа.
 */
export function DocumentForm({
  templates,
  categories,
  clients,
  orders,
}: {
  templates: TemplateOption[];
  categories: CategoryOption[];
  clients: ClientOption[];
  orders: OrderOption[];
}) {
  const [state, action, pending] = useActionState(createDocument, initial);
  const [templateId, setTemplateId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [tables, setTables] = useState<Record<string, ItemRow[]>>({});

  const template = templates.find((t) => String(t.id) === templateId) ?? null;

  const fields: TemplateField[] = useMemo(() => {
    if (!template?.fieldsSchema) return [];
    // Схему уже проверял редактор шаблона; здесь просто разбираем
    const parsed = parseFieldsSchema(JSON.stringify(template.fieldsSchema));
    return parsed.ok && parsed.value ? parsed.value.fields : [];
  }, [template]);

  function pickTemplate(value: string) {
    setTemplateId(value);
    setValues({});
    setTables({});
    const t = templates.find((x) => String(x.id) === value);
    if (t?.categoryId && categoryId === "") setCategoryId(String(t.categoryId));
  }

  /** Подставляет реквизиты выбранного клиента в подходящие по имени поля. */
  function autofillFromClient(clientId: string) {
    const client = clients.find((c) => String(c.id) === clientId);
    if (!client) return;
    const map: Record<string, string | null> = {
      client_name: client.name,
      counterparty: client.name,
      client_inn: client.inn,
      client_email: client.email,
      client_phone: client.phone,
      client_address: null,
    };
    setValues((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        if (f.name in map && map[f.name] && !next[f.name]) next[f.name] = map[f.name]!;
      }
      return next;
    });
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>НАЗВАНИЕ</span>
            <input
              name="title"
              maxLength={255}
              placeholder="Договор на печать баннеров"
              className={cn(inputClass, state.fieldErrors?.title && "border-danger")}
            />
            {state.fieldErrors?.title && (
              <span className="text-xs text-danger">{state.fieldErrors.title}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ШАБЛОН</span>
            <select
              name="templateId"
              value={templateId}
              onChange={(e) => pickTemplate(e.target.value)}
              className={inputClass}
            >
              <option value="">Без шаблона</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.prefix ? ` (${t.prefix})` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink/45">
              {fields.length > 0
                ? `Заполните ${fields.length} полей ниже - подставим в документ`
                : "Даёт префикс номера и заготовку текста"}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>РАЗДЕЛ</span>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">Без раздела</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>НОМЕР</span>
            <input
              name="documentNumber"
              maxLength={50}
              placeholder="Оставьте пустым - присвоим по шаблону"
              className={cn(
                inputClass,
                "font-mono",
                state.fieldErrors?.documentNumber && "border-danger",
              )}
            />
            {state.fieldErrors?.documentNumber && (
              <span className="text-xs text-danger">{state.fieldErrors.documentNumber}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ТИП</span>
            <select name="docType" defaultValue="internal" className={inputClass}>
              {(Object.keys(DOC_TYPE) as (keyof typeof DOC_TYPE)[]).map((key) => (
                <option key={key} value={key}>
                  {DOC_TYPE[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>СОСТОЯНИЕ</span>
            <select name="status" defaultValue="draft" className={inputClass}>
              {(Object.keys(DOC_STATUS) as (keyof typeof DOC_STATUS)[]).map((key) => (
                <option key={key} value={key}>
                  {DOC_STATUS[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>СУММА, ₽</span>
            <input
              name="amount"
              inputMode="decimal"
              placeholder="Если документ денежный"
              className={cn(inputClass, "font-mono", state.fieldErrors?.amount && "border-danger")}
            />
            {state.fieldErrors?.amount && (
              <span className="text-xs text-danger">{state.fieldErrors.amount}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ДАТА ДОКУМЕНТА</span>
            <input type="date" name="documentDate" className={cn(inputClass, "font-mono")} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ДЕЙСТВУЕТ ДО</span>
            <input type="date" name="validUntil" className={cn(inputClass, "font-mono")} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>КЛИЕНТ</span>
            <select
              name="userId"
              defaultValue=""
              onChange={(e) => autofillFromClient(e.target.value)}
              className={inputClass}
            >
              <option value="">Не привязан</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
            {fields.length > 0 && (
              <span className="text-xs text-ink/45">Подставит реквизиты в поля ниже</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ЗАКАЗ С САЙТА</span>
            <select name="orderId" defaultValue="" className={inputClass}>
              <option value="">Не привязан</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  № {o.id}
                  {o.clientName ? ` · ${o.clientName}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ---------- Поля шаблона ---------- */}
      {fields.length > 0 && (
        <section className="rounded-xl border border-ink/10 bg-bone p-5">
          <h2 className="mb-4 font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
            ПОЛЯ ДОКУМЕНТА
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) =>
              field.type === "items_table" ? (
                <div key={field.name} className="sm:col-span-2">
                  <ItemsField
                    label={field.label ?? field.name}
                    rows={tables[field.name] ?? []}
                    onChange={(rows) => setTables((p) => ({ ...p, [field.name]: rows }))}
                    name={`fields.${field.name}`}
                  />
                </div>
              ) : (
                <label
                  key={field.name}
                  className={cn("flex flex-col gap-1.5", field.type === "textarea" && "sm:col-span-2")}
                >
                  <span className={labelClass}>
                    {(field.label ?? field.name).toUpperCase()}
                    {field.required && <span className="text-danger"> *</span>}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      name={`fields.${field.name}`}
                      rows={3}
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [field.name]: e.target.value }))}
                      className={cn(inputClass, "resize-y")}
                    />
                  ) : (
                    <input
                      name={`fields.${field.name}`}
                      type={field.type === "date" ? "date" : field.type === "number" ? "text" : "text"}
                      inputMode={field.type === "number" ? "decimal" : undefined}
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [field.name]: e.target.value }))}
                      className={cn(inputClass, (field.type === "number" || field.type === "date") && "font-mono")}
                    />
                  )}
                </label>
              ),
            )}
          </div>
        </section>
      )}

      {/* ---------- Ручной текст ---------- */}
      <section className="rounded-xl border border-ink/10 bg-bone p-5">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ТЕКСТ ВРУЧНУЮ</span>
          <textarea
            name="content"
            rows={6}
            placeholder={
              fields.length > 0
                ? "Оставьте пустым - соберём документ из полей выше. Заполните, чтобы задать текст целиком."
                : template
                  ? "Пусто - возьмём заготовку из шаблона"
                  : "Текст документа"
            }
            className={cn(inputClass, "resize-y")}
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОЗДАЮ…" : "СОЗДАТЬ ДОКУМЕНТ"}
        </button>
        {state.error && (
          <span className="flex items-center gap-2 text-sm text-danger" role="status">
            <TriangleAlert className="size-4" aria-hidden />
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Таблица позиций. Значение уходит на сервер одним скрытым полем в JSON -
 * так серверу не нужно знать про индексы строк, а форме про формат хранения.
 */
function ItemsField({
  label,
  rows,
  onChange,
  name,
}: {
  label: string;
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  name: string;
}) {
  const set = (i: number, patch: Partial<ItemRow>) =>
    onChange(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/60 p-3">
      <p className={cn(labelClass, "mb-2")}>{label.toUpperCase()}</p>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={row.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder="Наименование"
              className={cn(inputClass, "min-w-40 flex-1")}
            />
            <input
              value={row.quantity}
              onChange={(e) => set(i, { quantity: e.target.value })}
              placeholder="Кол-во"
              inputMode="decimal"
              className={cn(inputClass, "w-20 font-mono")}
            />
            <input
              value={row.unit}
              onChange={(e) => set(i, { unit: e.target.value })}
              placeholder="шт."
              className={cn(inputClass, "w-16")}
            />
            <input
              value={row.price}
              onChange={(e) => set(i, { price: e.target.value })}
              placeholder="Цена"
              inputMode="decimal"
              className={cn(inputClass, "w-24 font-mono")}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label="Убрать позицию"
              className="rounded p-1.5 text-ink/30 hover:bg-danger/10 hover:text-danger"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", quantity: "1", price: "", unit: "шт." }])}
        className="mt-2 flex items-center gap-1.5 text-xs text-brand hover:text-brand-bright"
      >
        <Plus className="size-3.5" aria-hidden />
        Добавить позицию
      </button>
    </div>
  );
}

const labelClass = adminLabelClass;
const inputClass = adminInputClass;
