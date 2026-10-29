/**
 * Выдаёт ролям права на модули crm и counterparties.
 *
 *   npm run grant-module-permissions            # применить
 *   npm run grant-module-permissions -- --force # применить, даже если уже запускали
 *
 * Раньше CRM и контрагенты были закрыты правом users.*. Теперь у них свои
 * модули, и без записей в role_permissions менеджер на проде потерял бы
 * доступ к обоим разделам. Каждой роли копируем те действия, что у неё
 * есть на users: доступ остаётся ровно прежним, а дальше его можно
 * менять по модулям отдельно.
 *
 * Идемпотентно и разово. Строки вставляются с on conflict do nothing, а
 * отметка в settings не даёт скрипту при каждом деплое возвращать права,
 * которые администратор потом осознанно забрал. Нет ни одной строки users -
 * значит, база пустая (первая установка): ничего не делаем и отметку не
 * ставим, чтобы запуск после seed-permissions сработал.
 */
import pg from "pg";
import { databaseUrl } from "./db-url.mjs";

const MARKER = "migration.crm_counterparties_permissions";
const force = process.argv.includes("--force");

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();

try {
  await client.query("begin");

  if (!force) {
    const done = await client.query("select 1 from settings where name = $1", [MARKER]);
    if (done.rowCount > 0) {
      await client.query("rollback");
      console.log("Права на crm и counterparties уже выдавались - пропускаем (--force повторит).");
      process.exit(0);
    }
  }

  const source = await client.query("select count(*)::int as n from role_permissions where module = 'users'");
  if (source.rows[0].n === 0) {
    await client.query("rollback");
    console.log("В role_permissions нет прав на users - выдавать нечего (пустая база). Отметка не ставится.");
    process.exit(0);
  }

  const granted = await client.query(
    `insert into role_permissions (role, module, action)
     select rp.role, m.module, rp.action
     from role_permissions rp
     cross join (values ('crm'), ('counterparties')) as m(module)
     where rp.module = 'users'
     on conflict (role, module, action) do nothing`,
  );

  await client.query(
    `insert into settings (name, value) values ($1, $2)
     on conflict (name) do update set value = excluded.value`,
    [MARKER, new Date().toISOString()],
  );

  await client.query("commit");
  console.log(`Прав на crm и counterparties добавлено: ${granted.rowCount}.`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Не удалось выдать права:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
