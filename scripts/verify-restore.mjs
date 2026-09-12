/**
 * Сверяет, что тестовые правки в базе откачены и данные совпадают с дампом.
 *
 *   node scripts/verify-restore.mjs
 *
 * Нужен после ручных проверок: во время них приходится временно менять
 * пароли и статусы, и хочется убедиться, что ничего не осталось изменённым.
 */
import { execFileSync } from "node:child_process";
import { readSchemaDump } from "./schema-dump.mjs";

const q = (sql) =>
  execFileSync(
    "docker",
    ["exec", "bzk-app-db-1", "psql", "-U", "bzk", "-d", "bzk", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  ).trim();

const dump = readSchemaDump();

/** Достаёт первый INSERT для таблицы и режет его на кортежи. */
function tuples(table) {
  const start = dump.indexOf(`INSERT INTO \`${table}\``);
  if (start < 0) return [];
  const stmt = dump.slice(start, dump.indexOf(");", start) + 2);
  return stmt.match(/\((?:[^()']|'(?:[^']|\\')*')*\)/g) ?? [];
}

let ok = true;
const report = (label, good, extra = "") => {
  ok = ok && good;
  console.log(`${good ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

// ---- пароли
const userRows = tuples("users");
for (const id of [2, 14]) {
  const row = userRows.find((t) => t.startsWith(`(${id},`));
  const hash = row?.match(/'(\$2y\$[^']+)'/)?.[1];
  const inDb = q(`SELECT password FROM users WHERE id=${id}`);
  report(`пароль пользователя ${id}`, hash === inDb);
}

// ---- заказ
const orderRow = tuples("orders").find((t) => t.startsWith("(17,"));
const status = orderRow?.match(/'(pending|processing|in_work|delayed|shipped|delivered|cancelled|completed)'/)?.[1];
const dbStatus = q("SELECT status FROM orders WHERE id=17");
report("статус заказа 17", status === dbStatus, `${dbStatus} (в дампе ${status})`);

// ---- права
const perms = q(
  "SELECT string_agg(action,',' ORDER BY action) FROM role_permissions WHERE role='admin' AND module='orders'",
);
report("права admin на заказы", perms === "create,delete,edit,view", perms);

// ---- лишние пользователи
//
// Считаем по id в начале кортежа, а не по числу кортежей: разбиение на
// кортежи спотыкается об экранированные кавычки внутри JSON-полей и даёт
// лишние совпадения.
const dumpIds = new Set(
  [...dump.slice(dump.indexOf("INSERT INTO `users`")).matchAll(/\((\d+), '/g)]
    .map((m) => m[1])
    .slice(0, 50),
);
const dbIds = new Set(q("SELECT id FROM users ORDER BY id").split("\n").filter(Boolean));
const extra = [...dbIds].filter((id) => !dumpIds.has(id));
const missing = [...dumpIds].filter((id) => !dbIds.has(id));

report(
  "состав пользователей",
  extra.length === 0 && missing.length === 0,
  extra.length ? `лишние: ${extra.join(", ")}` : missing.length ? `нет: ${missing.join(", ")}` : `${dbIds.size} шт.`,
);

// ---- количество строк в таблицах, которые трогают проверки
//
// Считаем по началу кортежа «(число,» - разбиение на полные кортежи
// спотыкается об экранированные кавычки внутри JSON-полей.
function dumpRows(table) {
  const start = dump.indexOf(`INSERT INTO \`${table}\``);
  if (start < 0) return 0;
  const stmt = dump.slice(start, dump.indexOf(");", start));
  return (stmt.match(/\(\d+,/g) ?? []).length;
}

const TABLES = [
  "orders",
  "order_items",
  "products",
  "materials",
  "materials_movements",
  "materials_stock",
  "stock_alerts",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "production_orders",
  "production_order_stages",
  "production_stage_log",
  "production_stages",
  // Кабинет клиента: проверки раздела наполняют эти таблицы, и после них
  // легко забыть убрать за собой
  "client_uploads",
  "mini_warehouse_items",
  "support_tickets",
  "support_ticket_messages",
  "chat_messages",
  "order_chats",
  // Контроль качества: справочники должны остаться, а проверки и брак -
  // не появиться сами собой после прогонов
  "qc_checklists",
  "qc_checklist_items",
  "qc_inspections",
  "qc_inspection_results",
  "qc_defects",
  // Заказы менеджера - основной поток работы; при проверке раздела легко
  // оставить лишнюю запись в истории сроков
  "external_orders",
  "external_order_items",
  "external_order_ready_history",
  // Восьмой этап: задачи, CRM, обращения и промокоды
  "tasks",
  "task_comments",
  "crm_leads",
  "crm_interactions",
  "crm_reminders",
  "contact_messages",
  "promocodes",
  "order_promocodes",
  "reviews",
  "seo_settings",
  "notification_log",
];

for (const table of TABLES) {
  const inDb = q(`SELECT count(*) FROM ${table}`);
  const inDump = String(dumpRows(table));
  report(table, inDb === inDump, `${inDb} (дамп ${inDump})`);
}

// Привязки телеграма: проверка бота их меняет, и вернуться они должны
// к тем же трём чатам, что в дампе
const tgLinks = q("SELECT count(*) FROM users WHERE telegram_chat_id IS NOT NULL");
report("привязки телеграма", tgLinks === "3", tgLinks + " (ожидаем 3)");

// Флаги платных разделов включаются вручную конкретным клиентам -
// временно включённый на проверке флаг обязан вернуться на место
const warehouseFlags = q("SELECT count(*) FROM users WHERE mini_warehouse_enabled");
report("флаг мини-склада", warehouseFlags === "1", warehouseFlags + " пользователь (ожидаем 1)");

const editorFlags = q("SELECT count(*) FROM users WHERE can_use_editor");
report("флаг редактора открыток", editorFlags === "2", editorFlags + " пользователя (ожидаем 2)");

// Таблица settings намеренно расходится с дампом: в ней была одна строка
// (tax_rate), а теперь ещё четырнадцать ключей с реквизитами продавца -
// их добавляет scripts/seed-company.mjs. Проверяем, что старая строка на
// месте и что реквизиты не растеряны, а не совпадение числа строк.
const taxRate = q("SELECT value FROM settings WHERE name = 'tax_rate'");
report("settings: tax_rate", taxRate === "6", taxRate || "нет строки");

const companyKeys = q("SELECT count(*) FROM settings WHERE name LIKE 'company_%'");
report("settings: реквизиты", companyKeys === "14", companyKeys + " ключей (ожидаем 14)");

console.log(ok ? "\nВсё восстановлено." : "\nЕсть расхождения - смотрите выше.");
process.exit(ok ? 0 : 1);
