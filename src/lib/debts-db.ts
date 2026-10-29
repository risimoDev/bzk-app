import "server-only";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  clients,
  externalOrders,
  orderChats,
  orderPayments,
  orders,
  ordersAccounting,
  productionOrders,
  users,
} from "@/db/schema";
import { REPORT_TZ } from "@/lib/analytics";
import { MONEY_EPS, round2 } from "@/lib/order-money";
import { STAFF_ROLES } from "@/lib/staff";
import {
  debtAgeDays,
  debtStart,
  overdueWarning,
  parsePartyKey,
  partyKeyOf,
  reconcile,
  statusFromAudit,
  type ActCharge,
  type ActPayment,
  type ParsedParty,
  type Reconciliation,
  type StatusEvent,
} from "@/lib/debts";

/**
 * Долги и акт сверки: чтение из базы.
 *
 * Долг заказа - тот же, что в отчётах: доход карточки минус её платежи,
 * отменённые не считаются (см. `openDebt` в order-money-db.ts). Здесь он
 * только раскладывается по заказам и плательщикам, а дата готовности
 * достаётся из журнала действий и производства.
 */

export type DebtOrder = {
  cardId: number;
  source: "site" | "external";
  orderId: number;
  /** Номер, как его видят люди: у заказа менеджера с буквой («81-М»). */
  number: string;
  href: string;
  partyKey: string;
  partyName: string;
  income: number;
  paid: number;
  debt: number;
  status: string | null;
  isCancelled: boolean;
  createdAt: Date;
  /** Когда заказ стал готов/выдан; null - ещё нет, отсчёта нет. */
  since: Date | null;
  /** Дата взята по дате заказа, а не по журналу. */
  approximate: boolean;
  ageDays: number | null;
  responsibleId: number | null;
  responsibleName: string | null;
  /** Когда по этому долгу уже заводилась задача. */
  taskAt: Date | null;
};

type Card = {
  cardId: number;
  source: "site" | "external";
  orderId: number;
  income: number;
  paid: number;
  status: string | null;
  isCancelled: boolean;
  createdAt: Date;
  userId: number | null;
  clientId: number | null;
  clientName: string | null;
  taskAt: Date | null;
};

const orderNumber = (source: "site" | "external", id: number) =>
  source === "external" ? `${id}-М` : String(id);

const orderHref = (source: "site" | "external", id: number) =>
  source === "external" ? `/admin/external-orders/${id}` : `/admin/orders/${id}`;

/** user_id -> id контрагента, привязанного к аккаунту (первый по номеру). */
async function counterpartyByUser() {
  const rows = await db
    .select({ id: clients.id, userId: clients.userId })
    .from(clients)
    .where(sql`${clients.userId} is not null`)
    .orderBy(clients.id);
  const map = new Map<number, number>();
  for (const r of rows) if (r.userId !== null && !map.has(r.userId)) map.set(r.userId, r.id);
  return map;
}

/** Ключ плательщика для заказа с сайта. */
export async function partyKeyForUser(userId: number) {
  return partyKeyOf({
    source: "site",
    userId,
    clientId: null,
    clientName: null,
    counterpartyByUser: await counterpartyByUser(),
  });
}

/** Ключ плательщика для заказа менеджера. */
export function partyKeyForExternal(clientId: number | null, clientName: string | null) {
  return partyKeyOf({
    source: "external",
    userId: null,
    clientId,
    clientName,
    counterpartyByUser: new Map(),
  });
}

/**
 * Карточки с деньгами. `openOnly` - только с непогашенным остатком и не
 * отменённые (для долгов); без него - все карточки плательщика (для акта).
 */
async function loadCards(opts: { openOnly: boolean; party?: ParsedParty | null }) {
  const cardPaid = db
    .select({
      cardId: orderPayments.orderAccountingId,
      paid: sql<string>`sum(${orderPayments.amount})`.as("paid"),
    })
    .from(orderPayments)
    .groupBy(orderPayments.orderAccountingId)
    .as("card_paid");

  // Плательщик сужает выборку в SQL, чтобы акт одного контрагента не тянул
  // всю бухгалтерию; точный отбор всё равно делает partyKeyOf ниже
  let partyFilter: SQL | undefined;
  const counterparties = await counterpartyByUser();
  let partyUserId: number | null = null;
  let partyClientId: number | null = null;
  const party = opts.party ?? null;
  if (party?.kind === "counterparty") {
    partyClientId = party.id;
    const [c] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, party.id)).limit(1);
    partyUserId = c?.userId ?? null;
  } else if (party?.kind === "user") {
    partyUserId = party.id;
    // Аккаунт привязан к контрагенту - платежи и заказы идут под ним
    const linked = counterparties.get(party.id);
    if (linked !== undefined) partyClientId = linked;
  }
  if (party) {
    const parts: SQL[] = [];
    if (party.kind === "name") {
      parts.push(
        inArray(
          ordersAccounting.externalOrderId,
          db.select({ id: externalOrders.id }).from(externalOrders).where(isNull(externalOrders.clientId)),
        ),
      );
    } else {
      if (partyClientId !== null) {
        parts.push(
          inArray(
            ordersAccounting.externalOrderId,
            db.select({ id: externalOrders.id }).from(externalOrders).where(eq(externalOrders.clientId, partyClientId)),
          ),
        );
      }
      if (partyUserId !== null) {
        parts.push(
          inArray(
            ordersAccounting.orderId,
            db.select({ id: orders.id }).from(orders).where(eq(orders.userId, partyUserId)),
          ),
        );
      }
    }
    // Нет ни одной подходящей ветки (контрагента не существует) - пустой результат
    partyFilter = parts.length > 0 ? or(...parts) : sql`false`;
  }

  const rows = await db
    .select({
      cardId: ordersAccounting.id,
      source: ordersAccounting.source,
      orderId: ordersAccounting.orderId,
      externalOrderId: ordersAccounting.externalOrderId,
      income: ordersAccounting.income,
      paid: sql<string>`coalesce(card_paid.paid, 0)`,
      isCancelled: ordersAccounting.isCancelled,
      taskAt: ordersAccounting.debtTaskAt,
      siteStatus: orders.status,
      siteCreatedAt: orders.createdAt,
      siteUserId: orders.userId,
      extStatus: externalOrders.productionStatus,
      extCreatedAt: externalOrders.createdAt,
      extClientId: externalOrders.clientId,
      extClientName: externalOrders.clientName,
    })
    .from(ordersAccounting)
    .leftJoin(cardPaid, eq(cardPaid.cardId, ordersAccounting.id))
    .leftJoin(orders, eq(orders.id, ordersAccounting.orderId))
    .leftJoin(externalOrders, eq(externalOrders.id, ordersAccounting.externalOrderId))
    .where(
      and(
        opts.openOnly
          ? and(
              eq(ordersAccounting.isCancelled, false),
              // Имена колонок с таблицей сами: в соединении без этого неоднозначно
              sql`orders_accounting.income - coalesce(card_paid.paid, 0) > ${MONEY_EPS}`,
            )
          : undefined,
        partyFilter,
      ),
    );

  const cards: Card[] = [];
  for (const r of rows) {
    if (r.source === "site" && r.orderId !== null && r.siteUserId !== null) {
      cards.push({
        cardId: r.cardId,
        source: "site",
        orderId: r.orderId,
        income: Number(r.income),
        paid: Number(r.paid),
        status: r.siteStatus,
        isCancelled: r.isCancelled,
        createdAt: r.siteCreatedAt ?? new Date(0),
        userId: r.siteUserId,
        clientId: null,
        clientName: null,
        taskAt: r.taskAt,
      });
    } else if (r.source === "external" && r.externalOrderId !== null) {
      cards.push({
        cardId: r.cardId,
        source: "external",
        orderId: r.externalOrderId,
        income: Number(r.income),
        paid: Number(r.paid),
        status: r.extStatus,
        isCancelled: r.isCancelled,
        createdAt: r.extCreatedAt ?? new Date(0),
        userId: null,
        clientId: r.extClientId,
        clientName: r.extClientName,
        taskAt: r.taskAt,
      });
    }
  }

  const keyOf = (c: Card) =>
    partyKeyOf({
      source: c.source,
      userId: c.userId,
      clientId: c.clientId,
      clientName: c.clientName,
      counterpartyByUser: counterparties,
    });

  // Окончательный отбор по ключу: SQL выше мог взять лишнее (например,
  // заказы менеджера без контрагента с чужим именем)
  const wanted = party
    ? party.kind === "counterparty"
      ? `c:${party.id}`
      : party.kind === "user"
        ? (partyClientId !== null ? `c:${partyClientId}` : `u:${party.id}`)
        : `n:${party.name}`
    : null;

  return cards
    .map((c) => ({ card: c, partyKey: keyOf(c) }))
    .filter((x): x is { card: Card; partyKey: string } => x.partyKey !== null)
    .filter((x) => wanted === null || x.partyKey === wanted);
}

/** Названия плательщиков: контрагент - компания или имя, клиент сайта - так же. */
async function partyNames(keys: readonly string[]) {
  const clientIds: number[] = [];
  const userIds: number[] = [];
  const out = new Map<string, string>();
  for (const k of new Set(keys)) {
    const p = parsePartyKey(k);
    if (!p) continue;
    if (p.kind === "counterparty") clientIds.push(p.id);
    else if (p.kind === "user") userIds.push(p.id);
    else out.set(k, p.name);
  }
  if (clientIds.length > 0) {
    for (const c of await db
      .select({ id: clients.id, name: clients.name, companyName: clients.companyName })
      .from(clients)
      .where(inArray(clients.id, clientIds))) {
      out.set(`c:${c.id}`, c.companyName || c.name);
    }
  }
  if (userIds.length > 0) {
    for (const u of await db
      .select({ id: users.id, name: users.name, companyName: users.companyName, isCorporate: users.isCorporate })
      .from(users)
      .where(inArray(users.id, userIds))) {
      out.set(`u:${u.id}`, (u.isCorporate && u.companyName) || u.name);
    }
  }
  return out;
}

type History = {
  events: Map<string, StatusEvent[]>;
  responsible: Map<string, number>;
};

const refKey = (source: "site" | "external", id: number) => `${source}:${id}`;

/**
 * История статусов и ответственные для заказов.
 *
 * Дата готовности собирается из двух мест: журнала действий (ручная смена
 * статуса) и производства (последний этап закрыт - заказ становится
 * «готов к выдаче», в журнал это не пишется). Ответственный: назначенный в
 * чате заказа (заказы с сайта), иначе кто запустил заказ в цех, иначе кто
 * последним трогал заказ по журналу действий.
 */
async function loadHistory(cards: readonly Card[]): Promise<History> {
  const events = new Map<string, StatusEvent[]>();
  const candidates = new Map<string, number[]>();
  const push = (key: string, e: StatusEvent) => {
    const list = events.get(key) ?? [];
    list.push(e);
    events.set(key, list);
  };
  const addCandidate = (key: string, userId: number | null) => {
    if (userId === null) return;
    const list = candidates.get(key) ?? [];
    list.push(userId);
    candidates.set(key, list);
  };

  const siteIds = cards.filter((c) => c.source === "site").map((c) => c.orderId);
  const extIds = cards.filter((c) => c.source === "external").map((c) => c.orderId);
  if (siteIds.length + extIds.length === 0) return { events, responsible: new Map() };

  const forEntity = (ids: number[], type: "order" | "external_order") =>
    ids.length > 0 ? and(eq(auditLog.entityType, type), inArray(auditLog.entityId, ids)) : sql`false`;

  const [statusRows, lastActors, prod, chats] = await Promise.all([
    db
      .select({
        type: auditLog.entityType,
        id: auditLog.entityId,
        action: auditLog.action,
        details: auditLog.details,
        at: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          or(forEntity(siteIds, "order"), forEntity(extIds, "external_order")),
          inArray(auditLog.action, ["order.status", "order.status_change", "external_order.production_status"]),
        ),
      ),
    db
      .selectDistinctOn([auditLog.entityType, auditLog.entityId], {
        type: auditLog.entityType,
        id: auditLog.entityId,
        userId: auditLog.userId,
      })
      .from(auditLog)
      .where(and(or(forEntity(siteIds, "order"), forEntity(extIds, "external_order")), sql`${auditLog.userId} is not null`))
      .orderBy(auditLog.entityType, auditLog.entityId, desc(auditLog.createdAt)),
    db
      .select({
        orderId: productionOrders.orderId,
        externalOrderId: productionOrders.externalOrderId,
        status: productionOrders.status,
        completedAt: productionOrders.completedAt,
        createdBy: productionOrders.createdBy,
      })
      .from(productionOrders)
      .where(
        or(
          siteIds.length > 0 ? inArray(productionOrders.orderId, siteIds) : undefined,
          extIds.length > 0 ? inArray(productionOrders.externalOrderId, extIds) : undefined,
        ),
      ),
    siteIds.length > 0
      ? db
          .select({ orderId: orderChats.orderId, assigned: orderChats.assignedUserId })
          .from(orderChats)
          .where(inArray(orderChats.orderId, siteIds))
      : Promise.resolve([] as { orderId: number; assigned: number | null }[]),
  ]);

  for (const r of statusRows) {
    if (r.id === null || r.at === null) continue;
    const to = statusFromAudit(r.action, r.details);
    if (to === null) continue;
    push(refKey(r.type === "order" ? "site" : "external", r.id), { at: r.at, to });
  }

  // Производство: приоритет у чата заказа, потом тот, кто запустил в цех
  for (const c of chats) addCandidate(refKey("site", c.orderId), c.assigned);
  for (const p of prod) {
    const key = p.orderId !== null ? refKey("site", p.orderId) : p.externalOrderId !== null ? refKey("external", p.externalOrderId) : null;
    if (key === null) continue;
    if (p.status === "completed" && p.completedAt) push(key, { at: p.completedAt, to: "ready" });
    addCandidate(key, p.createdBy);
  }
  for (const a of lastActors) {
    if (a.id !== null) addCandidate(refKey(a.type === "order" ? "site" : "external", a.id), a.userId);
  }

  // Ответственным может быть только действующий сотрудник
  const allIds = [...new Set([...candidates.values()].flat())];
  const active = new Set<number>();
  if (allIds.length > 0) {
    for (const u of await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, allIds), inArray(users.role, [...STAFF_ROLES]), eq(users.isBlocked, false)))) {
      active.add(u.id);
    }
  }
  const responsible = new Map<string, number>();
  for (const [key, list] of candidates) {
    const first = list.find((id) => active.has(id));
    if (first !== undefined) responsible.set(key, first);
  }
  return { events, responsible };
}

async function staffNames(ids: readonly number[]) {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...ids]))) {
    out.set(u.id, u.name);
  }
  return out;
}

/**
 * Заказы с непогашенным долгом и их возраст.
 *
 * `partyKey` оставляет одного плательщика. Заказы, которые ещё не готовы,
 * тоже возвращаются (ageDays = null): долг по ним есть, но «просрочки»
 * пока нет.
 */
export async function loadDebtOrders(
  opts: { now?: Date; partyKey?: string | null } = {},
): Promise<DebtOrder[]> {
  const now = opts.now ?? new Date();
  const party = opts.partyKey ? parsePartyKey(opts.partyKey) : null;
  if (opts.partyKey && !party) return [];

  const found = await loadCards({ openOnly: true, party });
  if (found.length === 0) return [];

  const cards = found.map((x) => x.card);
  const [history, names] = await Promise.all([
    loadHistory(cards),
    partyNames(found.map((x) => x.partyKey)),
  ]);
  const staff = await staffNames([...new Set(history.responsible.values())]);
  // Плательщик по имени: показываем имя как его вписали, а не ключ в нижнем регистре
  for (const { card, partyKey } of found) {
    if (partyKey.startsWith("n:") && card.clientName?.trim()) names.set(partyKey, card.clientName.trim().replace(/\s+/g, " "));
  }

  return found
    .map(({ card, partyKey }): DebtOrder => {
      const key = refKey(card.source, card.orderId);
      const start = debtStart({
        currentStatus: card.status,
        events: history.events.get(key) ?? [],
        createdAt: card.createdAt,
      });
      const responsibleId = history.responsible.get(key) ?? null;
      return {
        cardId: card.cardId,
        source: card.source,
        orderId: card.orderId,
        number: orderNumber(card.source, card.orderId),
        href: orderHref(card.source, card.orderId),
        partyKey,
        partyName: names.get(partyKey) ?? partyKey,
        income: card.income,
        paid: card.paid,
        debt: Math.max(0, round2(card.income - card.paid)),
        status: card.status,
        isCancelled: card.isCancelled,
        createdAt: card.createdAt,
        since: start?.since ?? null,
        approximate: start?.approximate ?? false,
        ageDays: start ? debtAgeDays(start.since, now) : null,
        responsibleId,
        responsibleName: responsibleId !== null ? (staff.get(responsibleId) ?? null) : null,
        taskAt: card.taskAt,
      };
    })
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || b.debt - a.debt);
}

export type Debtor = {
  partyKey: string;
  name: string;
  orders: DebtOrder[];
  debt: number;
  /** Долг 15+ дней. */
  overdue: number;
  oldestAge: number | null;
};

/** Должники: заказы сгруппированы по плательщику, самые просроченные - первыми. */
export function groupDebtors(list: readonly DebtOrder[]): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const o of list) {
    let d = map.get(o.partyKey);
    if (!d) {
      d = { partyKey: o.partyKey, name: o.partyName, orders: [], debt: 0, overdue: 0, oldestAge: null };
      map.set(o.partyKey, d);
    }
    d.orders.push(o);
    d.debt = round2(d.debt + o.debt);
    if (o.ageDays !== null) {
      d.oldestAge = d.oldestAge === null ? o.ageDays : Math.max(d.oldestAge, o.ageDays);
    }
  }
  for (const d of map.values()) d.overdue = overdueWarning(d.orders)?.sum ?? 0;
  return [...map.values()].sort(
    (a, b) => (b.oldestAge ?? -1) - (a.oldestAge ?? -1) || b.debt - a.debt || a.name.localeCompare(b.name, "ru"),
  );
}

/**
 * Просроченный на 15+ дней долг плательщика для предупреждения в карточках
 * заказов. null - нет такого долга.
 */
export async function overdueDebtOf(partyKey: string | null, now = new Date()) {
  if (!partyKey) return null;
  return overdueWarning(await loadDebtOrders({ now, partyKey }));
}

/** Просроченный долг по всем плательщикам-контрагентам: для формы нового заказа. */
export async function overdueDebtByCounterparty(now = new Date()) {
  const out: Record<number, { n: number; sum: number }> = {};
  const byParty = new Map<string, DebtOrder[]>();
  for (const o of await loadDebtOrders({ now })) {
    if (!o.partyKey.startsWith("c:")) continue;
    byParty.set(o.partyKey, [...(byParty.get(o.partyKey) ?? []), o]);
  }
  for (const [key, list] of byParty) {
    const w = overdueWarning(list);
    if (w) out[Number(key.slice(2))] = w;
  }
  return out;
}

// -------------------------------------------------------------- акт сверки

const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: REPORT_TZ });

export type ActData = Reconciliation & {
  partyKey: string;
  partyName: string;
  /** Реквизиты плательщика, какие есть. */
  inn: string | null;
  address: string | null;
  hasApproximate: boolean;
};

/**
 * Данные акта сверки.
 *
 * Начисление - дата, когда заказ стал готов или выдан (та же, что для
 * возраста долга): отгрузка совершена, значит, клиент должен. Дата заказа
 * (она же дата УПД) для этого не годится - заказ мог лежать в работе
 * месяц. Заказы, ещё не готовые, и отменённые в начисления не входят.
 * Оплаты - по дате платежа (`order_payments.payment_date`), включая платежи
 * по отменённым заказам: деньги получены, и без них сальдо покажет долг,
 * которого нет.
 */
export async function loadReconciliation(
  partyKey: string,
  range: { from: Date; toExclusive: Date },
): Promise<ActData | null> {
  const party = parsePartyKey(partyKey);
  if (!party) return null;

  const found = await loadCards({ openOnly: false, party });
  if (found.length === 0) return null;

  const cards = found.map((x) => x.card);
  const canonical = found[0].partyKey;
  const [history, names, payRows] = await Promise.all([
    loadHistory(cards),
    partyNames([canonical]),
    db
      .select({
        cardId: orderPayments.orderAccountingId,
        amount: orderPayments.amount,
        at: orderPayments.paymentDate,
      })
      .from(orderPayments)
      .where(inArray(orderPayments.orderAccountingId, cards.map((c) => c.cardId))),
  ]);

  const byCard = new Map(cards.map((c) => [c.cardId, c]));
  const charges: ActCharge[] = [];
  for (const c of cards) {
    if (c.isCancelled) continue;
    const start = debtStart({
      currentStatus: c.status,
      events: history.events.get(refKey(c.source, c.orderId)) ?? [],
      createdAt: c.createdAt,
    });
    if (!start) continue;
    charges.push({
      at: start.since,
      amount: c.income,
      label: `Заказ № ${orderNumber(c.source, c.orderId)} от ${dayFmt.format(c.createdAt)}, УПД № ${orderNumber(c.source, c.orderId)}`,
      approximate: start.approximate,
    });
  }

  const payments: ActPayment[] = payRows.map((p) => {
    const c = byCard.get(p.cardId);
    return {
      at: p.at,
      amount: Number(p.amount),
      label: c
        ? `Оплата по заказу № ${orderNumber(c.source, c.orderId)}${c.isCancelled ? " (заказ отменён)" : ""}`
        : "Оплата",
    };
  });

  const result = reconcile({ ...range, charges, payments });

  // Реквизиты плательщика
  let inn: string | null = null;
  let address: string | null = null;
  if (party.kind === "counterparty" || canonical.startsWith("c:")) {
    const [c] = await db
      .select({ inn: clients.inn, address: clients.address })
      .from(clients)
      .where(eq(clients.id, Number(canonical.slice(2))))
      .limit(1);
    inn = c?.inn ?? null;
    address = c?.address ?? null;
  } else if (canonical.startsWith("u:")) {
    const [u] = await db
      .select({ inn: users.inn, address: users.legalAddress })
      .from(users)
      .where(eq(users.id, Number(canonical.slice(2))))
      .limit(1);
    inn = u?.inn ?? null;
    address = u?.address ?? null;
  }

  return {
    ...result,
    partyKey: canonical,
    partyName: names.get(canonical) ?? canonical,
    inn,
    address,
    // Приблизительная дата в любом начислении до конца периода (в том числе в
    // сальдо на начало) делает приблизительным и итог
    hasApproximate: charges.some((c) => c.approximate && c.at < range.toExclusive),
  };
}
