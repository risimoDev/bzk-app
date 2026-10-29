import "server-only";
import { and, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  commercialOffers,
  counters,
  documents,
  purchaseOrders,
  supportTickets,
} from "@/db/schema";
import type { Db } from "@/db";
import {
  counterKey,
  documentPrefix,
  formatDocumentNumber,
  formatOfferNumber,
  formatPurchaseNumber,
  formatTicketNumber,
  offerPrefix,
  purchasePrefix,
  ticketPrefix,
} from "@/lib/numbering";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Следующий номер по ключу счётчика - атомарно.
 *
 * Один `INSERT … ON CONFLICT DO UPDATE` берёт строку счётчика под
 * блокировку, поэтому два одновременных запроса получают разные номера и
 * второй просто ждёт первого. Прежний `count(*) + 1` и `max + 1` читали
 * таблицу и пересекались: вторая вставка падала на уникальном индексе
 * ошибкой 500.
 *
 * `floor` - наибольший номер, который уже есть в таблице (по ключу). Счётчик
 * никогда не выдаёт число не больше него: так он догоняет номера,
 * заведённые до появления счётчика или вписанные руками, и сам себя
 * чинит, если строку счётчика когда-нибудь сотрут.
 *
 * Номер выдаётся внутри транзакции вызывающего: откатили заказ - откатился
 * и номер, дыр в нумерации нет.
 */
export async function nextNumber(tx: Tx, key: string, floor = 0): Promise<number> {
  const start = Math.max(0, Math.floor(floor));
  const [row] = await tx
    .insert(counters)
    .values({ key, value: start + 1 })
    .onConflictDoUpdate({
      target: counters.key,
      // Имя таблицы в SET обязательно: без него `value` двусмысленно
      // (старая строка и вставляемая)
      set: { value: sql`greatest(counters.value, ${start}) + 1` },
    })
    .returning({ value: counters.value });
  return row.value;
}

/**
 * Наибольший порядковый номер среди значений колонки, начинающихся с
 * `prefix`. Без LIKE: подчёркивание и процент в префиксе шаблона не
 * должны работать как подстановка.
 */
async function maxSuffix(
  tx: Tx,
  table: PgTable,
  column: PgColumn,
  prefix: string,
  extra?: SQL,
): Promise<number> {
  const from = prefix.length + 1;
  const [row] = await tx
    .select({
      max: sql<number>`coalesce(max(substring(${column} from ${from}::int)::int), 0)`,
    })
    .from(table)
    .where(
      and(
        sql`starts_with(${column}, ${prefix})`,
        // ::int обязателен: без него Postgres читает параметр как шаблон
        // регулярки и `substring(x from '8')` возвращает не хвост строки.
        // Хвост из цифр: «ЗК-2026-007» -> «007». Ручные номера вида
        // «СЧ-2026-А» в счёт не идут. Девять знаков - предел int
        sql`substring(${column} from ${from}::int) ~ '^[0-9]{1,9}$'`,
        extra,
      ),
    );
  return Number(row?.max ?? 0);
}

/** «ЗК-2026-007» */
export async function nextPurchaseNumber(tx: Tx, year = new Date().getFullYear()) {
  const floor = await maxSuffix(
    tx,
    purchaseOrders,
    purchaseOrders.orderNumber,
    purchasePrefix(year),
  );
  return formatPurchaseNumber(year, await nextNumber(tx, counterKey.purchase(year), floor));
}

/** «КП-2026-0007» */
export async function nextOfferNumber(tx: Tx, year = new Date().getFullYear()) {
  const floor = await maxSuffix(
    tx,
    commercialOffers,
    commercialOffers.number,
    offerPrefix(year),
  );
  return formatOfferNumber(year, await nextNumber(tx, counterKey.offer(year), floor));
}

/** «TK-20261028-0003»; `ymd` - дата без дефисов. */
export async function nextTicketNumber(tx: Tx, ymd: string) {
  const floor = await maxSuffix(
    tx,
    supportTickets,
    supportTickets.ticketNumber,
    ticketPrefix(ymd),
  );
  return formatTicketNumber(ymd, await nextNumber(tx, counterKey.ticket(ymd), floor));
}

/** «СЧ-2026-0007» - префикс берётся у шаблона документа. */
export async function nextDocumentNumber(
  tx: Tx,
  prefix: string,
  year = new Date().getFullYear(),
) {
  const floor = await maxSuffix(
    tx,
    documents,
    documents.documentNumber,
    documentPrefix(prefix, year),
  );
  return formatDocumentNumber(
    prefix,
    year,
    await nextNumber(tx, counterKey.document(prefix, year), floor),
  );
}
