/**
 * Дозаполняет права администратора.
 *
 *   node scripts/seed-permissions.mjs
 *
 * Матрица прав перенесена со старого сайта как есть, и у администратора
 * в ней не хватало половины действий: прайс-лист нельзя было пополнить,
 * доску производства - завести, настройки - создать. Заказчик просил,
 * чтобы у администратора было открыто всё.
 *
 * Права менеджера не трогаем: у каждой роли свой набор, и это
 * намеренно. Скрипт идемпотентен - лишние строки не появятся.
 */
import pg from "pg";
import { databaseUrl } from "./db-url.mjs";

const url = databaseUrl();

/** Все модули админки и действия, которые в них вообще бывают. */
const MODULES = [
  "orders",
  "products",
  "users",
  "crm",
  "counterparties",
  "finance",
  "materials",
  "documents",
  "tasks",
  "kanban",
  "messaging",
  "calculator",
  "pricelist",
  "settings",
];

const ACTIONS = ["view", "create", "edit", "delete"];

const client = new pg.Client({ connectionString: url });
await client.connect();

let added = 0;
for (const module of MODULES) {
  for (const action of ACTIONS) {
    const r = await client.query(
      `insert into role_permissions (role, module, action)
       values ('admin', $1, $2)
       on conflict (role, module, action) do nothing`,
      [module, action],
    );
    added += r.rowCount;
  }
}

const { rows } = await client.query(
  "select count(*)::int as n from role_permissions where role = 'admin'",
);

console.log(`Добавлено прав администратору: ${added}. Всего у него: ${rows[0].n}.`);
await client.end();
