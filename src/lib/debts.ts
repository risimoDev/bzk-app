/**
 * Контроль долгов - чистые правила.
 *
 * Сколько должен заказ, считается не здесь: долг = доход - платежи, и это
 * уже делают отчёты (`debtOf`, `openDebt` в order-money*). Здесь то, чего
 * там нет: с какого дня долг «старый», в какую корзину он попадает, чей он
 * (клиент, контрагент) и как складывается акт сверки. Модуль без базы и
 * без Next - его проверяет scripts/check-debts.mjs.
 */

import { REPORT_TZ } from "@/lib/analytics";
import { localDate } from "@/lib/dates";
import { MONEY_EPS, round2 } from "@/lib/order-money";

// ------------------------------------------------------------------ возраст

/**
 * Статусы заказа, с которых начинается отсчёт долга: работа сделана и
 * заказ можно забрать или он уже у клиента. Пока заказ в работе, платить
 * «просроченно» нечем - предоплату могли не брать по договорённости.
 */
export const RELEASED_STATUSES = ["ready", "shipped", "delivered", "completed"] as const;

export function isReleasedStatus(status: string | null): boolean {
  return status !== null && (RELEASED_STATUSES as readonly string[]).includes(status);
}

/** Корзины возраста долга в днях: до 5, 6-14, 15 и больше. */
export const DEBT_BUCKETS = [
  { key: "fresh", label: "до 5 дней", from: 0, to: 5 },
  { key: "mid", label: "6-14 дней", from: 6, to: 14 },
  { key: "old", label: "15 дней и больше", from: 15, to: Infinity },
] as const;

export type DebtBucketKey = (typeof DEBT_BUCKETS)[number]["key"];

/** С этого возраста менеджеру заводится задача. */
export const DEBT_TASK_AGE_DAYS = DEBT_BUCKETS[1].from;

/** С этого возраста при заказе того же клиента показывается предупреждение. */
export const DEBT_WARN_AGE_DAYS = DEBT_BUCKETS[2].from;

export function debtBucket(ageDays: number): DebtBucketKey {
  const found = DEBT_BUCKETS.find((b) => ageDays >= b.from && ageDays <= b.to);
  return (found ?? DEBT_BUCKETS[0]).key;
}

/** Номер календарного дня в поясе отчётов: для разности «в днях» без часов. */
function reportDayNumber(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

/**
 * Сколько календарных дней прошло с `since`, по поясу отчётов.
 *
 * Считаем сутками календаря, а не делением на 24 часа: заказ, ставший
 * готовым в 23:00, к 08:00 следующего дня «прожил» один день, а не девять
 * часов, и менеджер видит те же числа, что и в журнале.
 */
export function debtAgeDays(since: Date, now: Date): number {
  return Math.max(0, reportDayNumber(now) - reportDayNumber(since));
}

/** Переход заказа в статус: из журнала действий или из производства. */
export type StatusEvent = { at: Date; to: string };

/**
 * Когда заказ стал готовым или выданным.
 *
 * `events` - переходы статуса в любом порядке. Берём последний вход в
 * «готов/выдан», после которого заказ не возвращали назад (вернули в
 * работу - отсчёт начинается заново, это уже другая готовность). Нет
 * подходящей записи (старые заказы со старого сайта, статус выставлен
 * в обход журнала) - берём дату заказа и честно говорим, что она
 * приблизительная: настоящая готовность была не раньше неё.
 *
 * Заказ, который сейчас не готов и не выдан, возраста долга не имеет.
 */
export function debtStart(input: {
  currentStatus: string | null;
  events: readonly StatusEvent[];
  createdAt: Date;
}): { since: Date; approximate: boolean } | null {
  if (!isReleasedStatus(input.currentStatus)) return null;

  const sorted = [...input.events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let since: Date | null = null;
  for (const e of sorted) {
    if (isReleasedStatus(e.to)) {
      if (since === null) since = e.at;
    } else {
      since = null;
    }
  }
  return since ? { since, approximate: false } : { since: input.createdAt, approximate: true };
}

/**
 * Переход статуса из строки журнала действий (audit_log).
 *
 * Форматы три: заказ с сайта (`order.status`, details.status), заказ
 * менеджера (`external_order.production_status`, details.to) и запись
 * старого сайта (`order.status_change`, details.new_status). Остальные
 * записи не про статус.
 */
export function statusFromAudit(action: string, details: unknown): string | null {
  const d = details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  if (!d) return null;
  const pick = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : null);
  if (action === "order.status") return pick("status");
  if (action === "external_order.production_status") return pick("to");
  if (action === "order.status_change") return pick("new_status");
  return null;
}

// ----------------------------------------------------------- задача менеджеру

/** Через сколько дней срок задачи по долгу (напомнит обычный механизм сроков). */
export const DEBT_TASK_DUE_DAYS = 3;

/**
 * Пора ли заводить задачу по долгу.
 *
 * Приблизительная дата не годится: у старого заказа возраст «год», хотя
 * порог он мог перейти давно, и по каждому такому заказу задача в первый
 * же проход завалила бы менеджеров. Такие долги видны на странице долгов,
 * а задачу заводим только там, где знаем, когда порог перейдён.
 */
export function isDebtTaskDue(d: {
  debt: number;
  ageDays: number | null;
  approximate: boolean;
  taskAt: Date | null;
}): boolean {
  return (
    d.taskAt === null &&
    !d.approximate &&
    d.ageDays !== null &&
    d.ageDays >= DEBT_TASK_AGE_DAYS &&
    d.debt > MONEY_EPS
  );
}

// ------------------------------------------------------------------ кто должен

export type PartyKind = "counterparty" | "user" | "name";

/**
 * Кто выставляет счета и платит: ключ плательщика.
 *
 * - `c:<id>` - контрагент (таблица clients). К нему относятся его заказы
 *   менеджера и заказы с сайта аккаунта, к которому он привязан;
 * - `u:<id>` - клиент сайта без контрагента;
 * - `n:<имя>` - заказ менеджера без контрагента (старые заказы): только
 *   имя, как его вписали, без учёта регистра и лишних пробелов.
 */
export function normalizePartyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function partyKeyOf(input: {
  source: "site" | "external";
  userId: number | null;
  clientId: number | null;
  clientName: string | null;
  /** user_id -> id контрагента, привязанного к этому аккаунту. */
  counterpartyByUser: ReadonlyMap<number, number>;
}): string | null {
  if (input.source === "external") {
    if (input.clientId !== null) return `c:${input.clientId}`;
    const n = normalizePartyName(input.clientName ?? "");
    return n === "" ? null : `n:${n}`;
  }
  if (input.userId === null) return null;
  const linked = input.counterpartyByUser.get(input.userId);
  return linked !== undefined ? `c:${linked}` : `u:${input.userId}`;
}

export type ParsedParty =
  | { kind: "counterparty"; id: number }
  | { kind: "user"; id: number }
  | { kind: "name"; name: string };

/** Разбор ключа из адреса. Всё, что не похоже на ключ, - null. */
export function parsePartyKey(raw: unknown): ParsedParty | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  const m = /^([cun]):([\s\S]+)$/.exec(raw);
  if (!m) return null;
  if (m[1] === "n") {
    const name = normalizePartyName(m[2]);
    return name === "" ? null : { kind: "name", name };
  }
  if (!/^\d{1,10}$/.test(m[2])) return null;
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return null;
  return { kind: m[1] === "c" ? "counterparty" : "user", id };
}

/** Ссылка на страницу долгов, сразу на одного плательщика. */
export const partyHref = (partyKey: string) =>
  `/admin/finance/debts?party=${encodeURIComponent(partyKey)}`;

// ------------------------------------------------------------- сводка долгов

export type DebtLine = {
  partyKey: string;
  debt: number;
  /** null - заказ ещё не готов, отсчёта нет. */
  ageDays: number | null;
};

export type BucketTotals = Record<DebtBucketKey, { n: number; sum: number }>;

export function emptyBuckets(): BucketTotals {
  return {
    fresh: { n: 0, sum: 0 },
    mid: { n: 0, sum: 0 },
    old: { n: 0, sum: 0 },
  };
}

/** Раскладка долгов по корзинам. Заказы без возраста (не готовы) не считаются. */
export function bucketTotals(lines: readonly Pick<DebtLine, "debt" | "ageDays">[]): BucketTotals {
  const out = emptyBuckets();
  for (const l of lines) {
    if (l.ageDays === null) continue;
    const b = out[debtBucket(l.ageDays)];
    b.n += 1;
    b.sum = round2(b.sum + l.debt);
  }
  return out;
}

/** Сколько просрочено на 15 и больше дней - для предупреждения. */
export function overdueWarning(
  lines: readonly Pick<DebtLine, "debt" | "ageDays">[],
): { n: number; sum: number } | null {
  let n = 0;
  let sum = 0;
  for (const l of lines) {
    if (l.ageDays !== null && l.ageDays >= DEBT_WARN_AGE_DAYS && l.debt > MONEY_EPS) {
      n += 1;
      sum = round2(sum + l.debt);
    }
  }
  return n > 0 ? { n, sum } : null;
}

// -------------------------------------------------------------- акт сверки

/** День периода акта как границы момента времени в поясе отчётов. */
export function reportDayStart(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, date));
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(utcMidnight)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(utcMidnight.getTime() - offsetMin * 60_000);
}

/** Следующий календарный день ГГГГ-ММ-ДД. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Период акта [с первого дня, по последний день включительно].
 * `to` включается целиком: платёж в 23:30 последнего дня - в периоде.
 */
export function reconciliationRange(fromDay: string, toDay: string) {
  return { from: reportDayStart(fromDay), toExclusive: reportDayStart(nextDay(toDay)) };
}

/** Период акта по умолчанию: с начала года по сегодня (по поясу компании). */
export function defaultActPeriod(now: Date = new Date()) {
  const today = localDate(now);
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export type ActCharge = {
  at: Date;
  amount: number;
  /** Подпись строки: «Заказ № 17-М (УПД от 01.10.2026)». */
  label: string;
  approximate: boolean;
};

export type ActPayment = {
  at: Date;
  amount: number;
  label: string;
};

export type ActRow = {
  at: Date;
  label: string;
  charge: number;
  payment: number;
  approximate: boolean;
};

export type Reconciliation = {
  opening: number;
  rows: ActRow[];
  charged: number;
  paid: number;
  closing: number;
};

/**
 * Свёртка акта сверки.
 *
 * Сальдо = начисления - оплаты; положительное - должен клиент, отрицательное
 * - у нас остался его аванс. Всё до начала периода сворачивается в сальдо
 * на начало, внутри периода строки идут по дате (при равной дате
 * начисление раньше оплаты - как в бухгалтерии: сначала отгрузили, потом
 * заплатили), после периода не входит никуда.
 *
 * Суммы считаются в копейках: сумма 0.1 + 0.2 не должна давать 0.30000000000000004
 * в итоге акта, который подписывают.
 */
export function reconcile(input: {
  from: Date;
  toExclusive: Date;
  charges: readonly ActCharge[];
  payments: readonly ActPayment[];
}): Reconciliation {
  const cents = (n: number) => Math.round(n * 100);
  let opening = 0;
  const rows: ActRow[] = [];

  for (const c of input.charges) {
    if (c.at < input.from) opening += cents(c.amount);
    else if (c.at < input.toExclusive) {
      rows.push({ at: c.at, label: c.label, charge: c.amount, payment: 0, approximate: c.approximate });
    }
  }
  for (const p of input.payments) {
    if (p.at < input.from) opening -= cents(p.amount);
    else if (p.at < input.toExclusive) {
      rows.push({ at: p.at, label: p.label, charge: 0, payment: p.amount, approximate: false });
    }
  }

  rows.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      // при равенстве начисление идёт раньше оплаты
      Number(b.charge > 0) - Number(a.charge > 0),
  );

  const charged = rows.reduce((s, r) => s + cents(r.charge), 0);
  const paid = rows.reduce((s, r) => s + cents(r.payment), 0);
  return {
    opening: opening / 100,
    rows,
    charged: charged / 100,
    paid: paid / 100,
    closing: (opening + charged - paid) / 100,
  };
}
