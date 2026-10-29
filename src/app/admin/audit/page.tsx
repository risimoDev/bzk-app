import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Журнал действий · Админка",
  robots: { index: false, follow: false },
};

const PER_PAGE = 50;

const when = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Подписи действий. Журнал пишет коды вида `finance.payment_delete`:
 * они стабильны для поиска, но читать их глазами неудобно. Код без
 * подписи показывается как есть - новое действие не должно пропадать
 * из журнала только потому, что его забыли сюда вписать.
 */
const ACTION_LABEL: Record<string, string> = {
  "order.create": "Оформлен заказ с сайта",
  "order.status": "Сменён статус заказа",
  "order.urgent": "Изменена срочность заказа",
  "order.item_delete": "Удалена позиция заказа",
  "order.documents_visible": "Документы заказа показаны или скрыты",
  "order.attach_counterparty": "Заказ привязан к контрагенту",
  "external_order.update": "Изменён заказ менеджера",
  "external_order.item_delete": "Удалена позиция заказа менеджера",
  "external_order.delete": "Удалён заказ менеджера",
  "finance.payment_add": "Добавлен платёж",
  "finance.payment_delete": "Удалён платёж",
  "finance.expense_add": "Добавлен расход",
  "finance.expense_delete": "Удалён расход",
  "finance.general_expense_add": "Добавлен общий расход",
  "finance.general_expense_delete": "Удалён общий расход",
  "product.create": "Заведён товар",
  "product.update": "Изменён товар",
  "product.price_tier": "Изменена цена по тиражу",
  "product.price_tier_delete": "Удалена ступень цены",
  "product.image.add": "Загружена картинка товара",
  "product.image.delete": "Удалена картинка товара",
  "product.attribute.save": "Изменена характеристика товара",
  "product.attribute.delete": "Удалена характеристика товара",
  "product.attribute.value.save": "Изменено значение характеристики",
  "product.attribute.value.delete": "Удалено значение характеристики",
  "counterparty.create": "Заведён контрагент",
  "counterparty.update": "Изменён контрагент",
  "counterparty.link": "Контрагент привязан к аккаунту",
  "counterparty.unlink": "Контрагент отвязан от аккаунта",
  "supplier.create": "Заведён подрядчик",
  "supplier.update": "Изменён подрядчик",
  "supplier.delete": "Удалён подрядчик",
  "material.create": "Заведён материал",
  "material.update": "Изменён материал",
  "material.write_off": "Списан материал",
  "material.write_off_return": "Списание возвращено на склад",
  "purchase.create": "Оформлена закупка",
  "purchase.receive": "Принята позиция закупки",
  "purchase.payment_add": "Отмечена оплата закупки",
  "purchase.payment_cancel": "Отменена оплата закупки",
  "quality.inspection": "Проведена проверка качества",
  "quality.defect": "Зарегистрирован дефект",
  "offer.create": "Создано КП",
  "offer.status": "Сменён статус КП",
  "offer.to_order": "КП превращено в заказ",
  "document.create": "Создан документ",
  "document.status": "Сменён статус документа",
  "document_template.save": "Изменён шаблон документа",
  "promocode.create": "Заведён промокод",
  "promocode.update": "Изменён промокод",
  "category.create": "Заведена категория товаров",
  "category.update": "Изменена категория товаров",
  "category.delete": "Удалена категория товаров",
  "expense_category.create": "Заведена статья расходов",
  "expense_category.update": "Изменена статья расходов",
  "document_category.create": "Заведён раздел документов",
  "document_category.update": "Изменён раздел документов",
  "production.start": "Заказ запущен в производство",
  "production.advance": "Заказ перешёл на следующий этап",
  "production.hold": "Производство приостановлено",
  "production_stage.save": "Изменён этап производства",
  "crm.lead_converted": "Лид превращён в клиента",
  "review.create": "Оставлен отзыв",
  "user.totp_enabled": "Включён вход с кодом",
  "user.totp_disabled": "Выключен вход с кодом",
  "user.block": "Пользователь заблокирован",
  "user.unblock": "Пользователь разблокирован",
  "user.editor_access": "Изменён доступ к редактору открыток",
  "user.warehouse_access": "Изменён доступ к мини-складу",
  "user.reset_link": "Отправлена ссылка на смену пароля",
  "crm.lead_create": "Заведён лид",
  "crm.lead_status": "Сменён статус лида",
  "task.create": "Создана задача",
  "task.status": "Сменён статус задачи",
  "task.assign": "Назначен исполнитель задачи",
  "task.delete": "Удалена задача",
  "quality.defect_status": "Сменён статус дефекта",
  "quality.defect_delete": "Удалён дефект",
  "quality.checklist_item_save": "Изменён пункт чек-листа",
  "quality.checklist_item_delete": "Удалён пункт чек-листа",
  "purchase.status": "Сменён статус закупки",
  "product.image.main": "Выбрано главное фото товара",
  "settings.company": "Изменены реквизиты компании",
  "seo.save": "Изменены SEO-тексты страницы",
  "seo.clear": "Сброшены SEO-тексты страницы",
  "message.delete": "Удалено обращение с сайта",
  "review.status": "Модерация отзыва",
  "promocode.toggle": "Промокод включён или выключен",
  "tochka.customer": "Выбрана компания в банке",
  "tochka.invoice_email": "Счёт банка отправлен на почту",
};

/** Куда ведёт запись: у части сущностей есть своя страница. */
const ENTITY: Record<string, { label: string; href?: (id: number) => string }> = {
  order: { label: "Заказ с сайта", href: (id) => `/admin/orders/${id}` },
  external_order: { label: "Заказ менеджера", href: (id) => `/admin/external-orders/${id}` },
  product: { label: "Товар", href: (id) => `/admin/products/${id}` },
  client: { label: "Контрагент", href: (id) => `/admin/counterparties/${id}` },
  supplier: { label: "Подрядчик", href: (id) => `/admin/suppliers/${id}` },
  material: { label: "Материал", href: (id) => `/admin/materials/${id}` },
  document: { label: "Документ", href: (id) => `/admin/documents/${id}` },
  document_template: { label: "Шаблон", href: (id) => `/admin/documents/templates/${id}` },
  orders_accounting: { label: "Карточка учёта", href: (id) => `/admin/finance/${id}` },
  crm_lead: { label: "Лид", href: (id) => `/admin/crm/${id}` },
  user: { label: "Пользователь", href: (id) => `/admin/clients/${id}` },
  commercial_offer: { label: "КП", href: (id) => `/print/offer/${id}` },
  production_order: { label: "Производство" },
  production_stage: { label: "Этап производства" },
  purchase_order: { label: "Закупка" },
  promocode: { label: "Промокод" },
  category: { label: "Категория" },
  expenses_category: { label: "Статья расходов" },
  document_category: { label: "Раздел документов" },
  general_expense: { label: "Общий расход" },
  review: { label: "Отзыв" },
  qc_inspection: { label: "Проверка качества", href: (id) => `/admin/quality/inspections/${id}` },
  qc_defect: { label: "Дефект" },
  qc_checklist: { label: "Чек-лист", href: (id) => `/admin/quality/checklists/${id}` },
  task: { label: "Задача" },
  contact_message: { label: "Обращение с сайта" },
  settings: { label: "Настройки" },
  seo_page: { label: "SEO" },
  tochka_invoice: { label: "Счёт банка" },
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Кратко о подробностях: журнал читают бегло, JSON целиком - под спойлером. */
function detailsPreview(details: unknown) {
  if (details === null || details === undefined) return null;
  const text = JSON.stringify(details);
  return text === "{}" ? null : text;
}

/**
 * Журнал действий сотрудников.
 *
 * Пишется с первого дня (`lib/audit.ts`), но смотреть его было негде -
 * «кто удалил платёж» выяснялся запросом к базе. Только для тех, у кого
 * есть права на настройки: в журнале видны деньги и адреса всех
 * сотрудников.
 */
export default async function AdminAudit({ searchParams }: PageProps<"/admin/audit">) {
  if (!(await can("settings", "view"))) {
    return (
      <AdminPage title="Журнал действий">
        <AdminEmpty title="Нет доступа" text="Журнал открыт только тем, у кого есть права на настройки." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 100);
  const userRaw = one(sp.user);
  const userId = parseId(userRaw);
  const type = one(sp.type);
  const page = pageFrom(sp.page);

  const conditions: SQL[] = [];
  // % и _ в поиске - обычные символы, а не шаблон LIKE
  if (q) conditions.push(ilike(auditLog.action, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  if (userId) conditions.push(eq(auditLog.userId, userId));
  if (type && type in ENTITY) conditions.push(eq(auditLog.entityType, type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ n: total }], staff] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        details: auditLog.details,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
        userName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(PER_PAGE)
      .offset(offsetOf(page, PER_PAGE)),
    db.select({ n: count() }).from(auditLog).where(where),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.role, ["admin", "manager"]))
      .orderBy(users.name),
  ]);

  const selectClass =
    "rounded-lg border border-ink/15 bg-bone px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";

  return (
    <AdminPage title="Журнал действий" subtitle={`Записей: ${total}`}>
      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Действие: payment, delete…"
            aria-label="Поиск по действию"
            className="w-64 rounded-lg border border-ink/15 bg-bone py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
          />
        </div>
        <select name="user" defaultValue={userId ? String(userId) : ""} aria-label="Сотрудник" className={selectClass}>
          <option value="">Все сотрудники</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type in ENTITY ? type : ""} aria-label="Раздел" className={selectClass}>
          <option value="">Все разделы</option>
          {Object.entries(ENTITY).map(([key, e]) => (
            <option key={key} value={key}>
              {e.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-ink px-4 py-2 text-sm text-bone transition-colors hover:bg-brand"
        >
          Показать
        </button>
        {(q || userId || type) && (
          <Link href="/admin/audit" className="text-sm text-ink/50 hover:text-brand">
            Сбросить
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <AdminEmpty title="Записей нет" text={where ? "Под фильтр ничего не попало." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left">
                {["Когда", "Кто", "Что", "Где", "Подробности"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 font-display text-[0.62rem] font-semibold tracking-[0.16em] text-ink/40"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const entity = r.entityType ? ENTITY[r.entityType] : undefined;
                const details = detailsPreview(r.details);
                return (
                  <tr key={r.id} className="border-b border-ink/6 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink/60">
                      {r.createdAt ? when.format(r.createdAt) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-ink/80">
                      {r.userName ?? (r.userId ? `№ ${r.userId}` : "система")}
                      {r.ipAddress && (
                        <span className="block font-mono text-[0.68rem] text-ink/35">{r.ipAddress}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink">{ACTION_LABEL[r.action] ?? r.action}</span>
                      {ACTION_LABEL[r.action] && (
                        <span className="block font-mono text-[0.68rem] text-ink/35">{r.action}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink/70">
                      {entity?.href && r.entityId ? (
                        <Link href={entity.href(r.entityId)} className="hover:text-brand">
                          {entity.label} № {r.entityId}
                        </Link>
                      ) : r.entityType ? (
                        `${entity?.label ?? r.entityType}${r.entityId ? ` № ${r.entityId}` : ""}`
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-80 px-4 py-2.5">
                      {details ? (
                        <code className="block break-all font-mono text-[0.7rem] text-ink/55">
                          {details.length > 240 ? `${details.slice(0, 240)}…` : details}
                        </code>
                      ) : (
                        <span className="text-ink/30">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager page={page} perPage={PER_PAGE} total={Number(total)} basePath="/admin/audit" params={sp} />
    </AdminPage>
  );
}
