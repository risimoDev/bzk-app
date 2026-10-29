/**
 * Дозаписывает в справочник notification_events события, добавленные после
 * переноса со старого сайта (список - src/lib/notify-events.ts).
 *
 *   npm run seed-notification-events
 *
 * Идемпотентно: существующие коды не трогаются (ни название, ни флаг
 * is_active, который могли поменять в админке). Код события в журнале
 * уведомлений - просто строка, без внешнего ключа, поэтому приложение
 * работает и без этой записи; справочник нужен, чтобы событие было
 * видно с человеческим названием.
 */
import pg from "pg";
import { databaseUrl } from "./db-url.mjs";
import { NEW_EVENTS } from "../src/lib/notify-events.ts";

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();

let added = 0;
for (const e of NEW_EVENTS) {
  const r = await client.query(
    `insert into notification_events (code, name, description, category)
     values ($1, $2, $3, $4::notification_events_category)
     on conflict (code) do nothing`,
    [e.code, e.name, e.description, e.category],
  );
  added += r.rowCount ?? 0;
}

console.log(`Событий уведомлений добавлено: ${added} из ${NEW_EVENTS.length}.`);
await client.end();
