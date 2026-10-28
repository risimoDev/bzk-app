/**
 * Номера документов: закупки, КП, обращения, бланки.
 *
 * Здесь только чистая часть - как выглядит номер и какой ключ у его
 * счётчика. Сами номера выдаёт `numbering-db.ts`.
 */

/** Число, дополненное нулями слева: 7 -> «007». Длиннее ширины не обрезается. */
export function padNumber(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** «ЗК-2026-007» */
export function purchasePrefix(year: number) {
  return `ЗК-${year}-`;
}
export function formatPurchaseNumber(year: number, n: number) {
  return purchasePrefix(year) + padNumber(n, 3);
}

/** «КП-2026-0007» - четыре знака, как у перенесённых со старого сайта */
export function offerPrefix(year: number) {
  return `КП-${year}-`;
}
export function formatOfferNumber(year: number, n: number) {
  return offerPrefix(year) + padNumber(n, 4);
}

/** «TK-20261028-0003»; нумерация внутри дня. `ymd` - дата без дефисов. */
export function ticketPrefix(ymd: string) {
  return `TK-${ymd}-`;
}
export function formatTicketNumber(ymd: string, n: number) {
  return ticketPrefix(ymd) + padNumber(n, 4);
}

/**
 * Номер документа по шаблону: префикс, год, порядковый номер за год -
 * «СЧ-2026-0007». Префикс у шаблона заканчивается дефисом («СЧ-»).
 */
export function documentPrefix(prefix: string, year: number) {
  return `${prefix}${year}-`;
}
export function formatDocumentNumber(prefix: string, year: number, n: number) {
  return documentPrefix(prefix, year) + padNumber(n, 4);
}

/** Ключи счётчиков в таблице counters. */
export const counterKey = {
  purchase: (year: number) => `purchase:${year}`,
  offer: (year: number) => `offer:${year}`,
  ticket: (ymd: string) => `ticket:${ymd}`,
  document: (prefix: string, year: number) => `doc:${prefix}${year}`,
};
