import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tochkaTokens } from "@/db/schema";
import { describeNetworkError } from "@/lib/tochka-errors";

/**
 * Клиент API Точка Банка.
 *
 * Перенесён с includes/tochka_api.php. Авторизация - статический JWT из
 * окружения, код компании (customerCode) выбирается один раз в админке и
 * хранится в таблице tochka_tokens.
 *
 * Документация: https://developers.tochka.com/docs/tochka-api/
 * Сверено с ней (в т.ч. со схемами методов):
 *  - авторизация JWT - только заголовок `Authorization: Bearer <токен>`;
 *    client_id для запросов не нужен (он нужен лишь для вебхуков);
 *  - customerCode передаётся в теле (`Data.customerCode`) или в пути
 *    (`/bills/{customerCode}/{documentId}/...`), заголовка нет;
 *  - accountId - «счёт/БИК», слеш в пути остаётся слешем.
 *
 * Банк подписан сертификатом Минцифры: без NODE_EXTRA_CA_CERTS (Dockerfile,
 * scripts/next-with-ca.mjs) fetch падает ещё до авторизации.
 */

const API_URL = (process.env.TOCHKA_API_URL?.trim() || "https://enter.tochka.com/uapi").replace(/\/+$/, "");
const JWT = process.env.TOCHKA_TOKEN?.trim() ?? "";

/** Ошибка стороннего API - отделяем от наших, чтобы показать текст банка. */
export class TochkaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TochkaError";
  }
}

export function isTochkaConfigured() {
  return JWT !== "";
}

/** Код компании: сначала из базы, затем из окружения. */
export async function getCustomerCode(): Promise<string | null> {
  const [row] = await db
    .select({ code: tochkaTokens.customerCode })
    .from(tochkaTokens)
    .orderBy(desc(tochkaTokens.id))
    .limit(1);

  return row?.code?.trim() || process.env.TOCHKA_CUSTOMER_CODE?.trim() || null;
}

/**
 * Запоминает выбранную компанию. Старые записи стираются: код всегда
 * один, а история выбора никому не нужна.
 */
export async function setCustomerCode(code: string) {
  await db.transaction(async (tx) => {
    await tx.delete(tochkaTokens);
    await tx.insert(tochkaTokens).values({ accessToken: "jwt", customerCode: code });
  });
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

/**
 * Единственное место, где уходит запрос к банку. Сетевая ошибка получает
 * понятную причину (см. tochka-errors.ts), токен в текст не попадает.
 */
async function bankFetch(endpoint: string, init: RequestInit & { json?: boolean }) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${JWT}`,
    Accept: init.json === false ? "*/*" : "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    return await fetch(API_URL + endpoint, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      // Банковские данные не кэшируем ни на секунду
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new TochkaError(`Не удалось связаться с банком: ${describeNetworkError(e)}`);
  }
}

/** Текст ошибки из тела ответа банка: `message` и подробности из `Errors[]`. */
function bankErrorMessage(parsed: unknown, status: number) {
  const p = parsed as Record<string, unknown> | null;
  const first = Array.isArray(p?.Errors) ? (p.Errors[0] as Record<string, unknown> | undefined) : undefined;
  const detail = typeof first?.message === "string" ? first.message : "";
  const main =
    (typeof p?.error_description === "string" && p.error_description) ||
    (typeof p?.error === "string" && p.error) ||
    (typeof p?.message === "string" && p.message) ||
    "";

  if (main && detail && detail !== main) return `${main}: ${detail}`;
  return main || detail || `Банк ответил ошибкой ${status}`;
}

async function request<T>(endpoint: string, opts: RequestOptions = {}): Promise<T> {
  if (!isTochkaConfigured()) {
    throw new TochkaError("JWT-токен не настроен: задайте TOCHKA_TOKEN в окружении");
  }

  const res = await bankFetch(endpoint, {
    method: opts.method,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Ответ не JSON - разберём ниже по коду статуса
  }

  if (!res.ok) throw new TochkaError(bankErrorMessage(parsed, res.status), res.status);

  return (parsed ?? {}) as T;
}

/** Бинарный ответ - PDF счёта или закрывающего документа. */
async function requestBinary(endpoint: string): Promise<Uint8Array> {
  if (!isTochkaConfigured()) {
    throw new TochkaError("JWT-токен не настроен: задайте TOCHKA_TOKEN в окружении");
  }

  const res = await bankFetch(endpoint, { json: false });

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await res.text());
    } catch {
      // Тело не JSON - достаточно кода статуса
    }
    throw new TochkaError(
      `Не удалось получить файл: ${bankErrorMessage(parsed, res.status)}`,
      res.status,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------- компании

export type TochkaCustomer = {
  customerCode: string;
  customerType?: string;
  shortName?: string;
  fullName?: string;
  taxCode?: string;
};

export async function getCustomers() {
  const r = await request<{ Data?: { Customer?: TochkaCustomer[] } }>(
    "/open-banking/v1.0/customers",
  );
  return r.Data?.Customer ?? [];
}

// ----------------------------------------------------------------- счета

export type TochkaAccount = {
  accountId: string;
  customerCode?: string;
  accountType?: string;
  currency?: string;
  accountDetails?: { identification?: string }[];
};

export async function getAccounts() {
  const r = await request<{ Data?: { Account?: TochkaAccount[] } }>(
    "/open-banking/v1.0/accounts",
  );
  const all = r.Data?.Account ?? [];

  // Ключ может видеть несколько компаний; счета чужой компании нам не нужны
  // ни в остатке, ни при выставлении счёта. Не нашлось ни одного - отдаём
  // всё как есть, чтобы пустой фильтр не прятал настоящую картину
  const code = await getCustomerCode();
  const own = code ? all.filter((a) => a.customerCode === code) : all;
  return own.length > 0 ? own : all;
}

/**
 * accountId - «номер счёта/БИК». В пути запроса слеш остаётся слешем (так
 * банк показывает адрес метода и так он собран в его коллекции Postman),
 * остальное кодируем.
 */
function accountPath(accountId: string) {
  return accountId.split("/").map(encodeURIComponent).join("/");
}

/** Номер счёта прячется внутри идентификатора вида «счёт/БИК». */
function accountNumberOf(account: TochkaAccount) {
  const id = account.accountDetails?.[0]?.identification ?? "";
  return id.split("/")[0] ?? "";
}

export type AccountSummary = {
  id: string;
  number: string;
  type: string;
  currency: string;
};

export async function getAccountsList(): Promise<AccountSummary[]> {
  const accounts = await getAccounts();
  return accounts.map((a) => ({
    id: a.accountId ?? "",
    number: accountNumberOf(a),
    type: a.accountType ?? "",
    currency: a.currency ?? "RUB",
  }));
}

type BalanceResponse = {
  Data?: {
    Balance?: {
      Amount?: { amount?: string | number; currency?: string };
      /** OpeningAvailable - начальный, ClosingAvailable - доступный, Expected - заблокированный */
      type?: string;
    }[];
  };
};

export async function getBalance(accountId: string) {
  return request<BalanceResponse>(
    `/open-banking/v1.0/accounts/${accountPath(accountId)}/balances`,
  );
}

export type TotalBalance = {
  total: number;
  currency: string;
  accounts: { accountId: string; accountNumber: string; balance: number; currency: string }[];
};

/**
 * Суммарный остаток. Счёт, по которому банк не отдал баланс, не роняет
 * весь запрос - он просто выпадает из списка, как и в старом коде.
 */
export async function getTotalBalance(targetAccountId?: string): Promise<TotalBalance | null> {
  const accounts = await getAccounts();
  if (accounts.length === 0) return null;

  const wanted = targetAccountId
    ? accounts.filter((a) => a.accountId === targetAccountId)
    : accounts;

  let total = 0;
  const rows: TotalBalance["accounts"] = [];
  let firstError: unknown = null;

  for (const account of wanted) {
    try {
      const r = await getBalance(account.accountId);
      // В ответе несколько видов остатка; «сколько денег на счёте сейчас» -
      // ClosingAvailable. Первый элемент массива мог оказаться начальным
      // остатком (OpeningAvailable) или суммой блокировок (Expected)
      const balance = r.Data?.Balance?.find((b) => b.type === "ClosingAvailable");
      if (!balance) continue;
      const amount = Number(balance.Amount?.amount ?? 0);
      if (!Number.isFinite(amount)) continue;

      total += amount;
      rows.push({
        accountId: account.accountId,
        accountNumber: accountNumberOf(account),
        balance: amount,
        currency: balance.Amount?.currency ?? account.currency ?? "RUB",
      });
    } catch (e) {
      firstError ??= e;
    }
  }

  // Если не отдал остаток ни один счёт - это сбой, а не нулевой баланс
  if (rows.length === 0 && firstError) throw firstError;

  return { total, currency: rows[0]?.currency ?? "RUB", accounts: rows };
}

/** Счёт по умолчанию - первый бизнес-счёт, иначе просто первый. */
export async function getDefaultAccountId(): Promise<string> {
  const accounts = await getAccounts();
  const business = accounts.find((a) => a.accountType === "Business");
  return business?.accountId ?? accounts[0]?.accountId ?? "";
}

// ------------------------------------------------------- единицы и НДС

/**
 * Единицы измерения банк принимает не кодом ОКЕИ, а строкой из своего
 * списка. Названия функции в старом коде («convertUnitToCode») вводили в
 * заблуждение - никакого кода там не было.
 */
const UNITS: Record<string, string> = {
  "шт": "шт.",
  "шт.": "шт.",
  "штука": "шт.",
  "штуки": "шт.",
  "услуга": "услуга.",
  "усл": "усл.ед.",
  "усл.ед": "усл.ед.",
  "м": "м.",
  "м.": "м.",
  "метр": "м.",
  "м2": "м2.",
  "кв.м": "м2.",
  "м3": "м3.",
  "куб.м": "м3.",
  "кг": "кг.",
  "кг.": "кг.",
  "г": "г.",
  "г.": "г.",
  "л": "л.",
  "л.": "л.",
  "компл": "компл.",
  "комплект": "компл.",
  "упак": "упак.",
  "упаковка": "упак.",
  "пачка": "пач.",
  "пач": "пач.",
  "час": "ч.",
  "ч": "ч.",
  "ч.": "ч.",
  "мин": "мин.",
  "минута": "мин.",
  "сут": "сут.",
  "сутки": "сут.",
  "км": "км.",
  "га": "га.",
  "гектар": "га.",
  "квт": "кВт.",
  "квт.ч": "кВт.ч.",
  "пар": "пар.",
  "пара": "пар.",
};

export function tochkaUnit(unit: string) {
  return UNITS[unit.trim().toLowerCase()] ?? "шт.";
}

/**
 * Допустимые банку ставки: nds_0, nds_5, nds_7, nds_10, nds_22, without_nds.
 * Ставки 20% у банка нет (с 2026 года - 22%), поэтому «nds_20» не
 * пересчитывается молча: другая ставка меняет сумму НДС в документе.
 */
const NDS: Record<string, string> = {
  nds_no: "without_nds",
  without_nds: "without_nds",
  nds_0: "nds_0",
  nds_5: "nds_5",
  nds_7: "nds_7",
  nds_10: "nds_10",
  nds_22: "nds_22",
};

export function tochkaNds(nds: string) {
  if (!Object.hasOwn(NDS, nds)) {
    throw new TochkaError(`Банк не принимает ставку НДС «${nds}»: допустимы 0, 5, 7, 10, 22 % и без НДС`);
  }
  return NDS[nds];
}

// ------------------------------------------------------------- позиции

export type DocumentItem = {
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  /** Сумма позиции; если не задана - считается как количество × цену */
  amount?: number;
  nds?: string;
};

type TochkaPosition = {
  positionName: string;
  quantity: number;
  unitCode: string;
  price: number;
  totalAmount: number;
  ndsKind: string;
};

function buildPositions(items: DocumentItem[]) {
  const positions: TochkaPosition[] = [];
  let totalAmount = 0;

  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const amount = +(item.amount ?? quantity * price).toFixed(2);
    totalAmount += amount;

    positions.push({
      positionName: item.name || "Услуга",
      quantity,
      unitCode: tochkaUnit(item.unit ?? "шт"),
      price,
      totalAmount: amount,
      ndsKind: tochkaNds(item.nds ?? "nds_no"),
    });
  }

  return { positions, totalAmount: +totalAmount.toFixed(2) };
}

/** ИНН из 12 цифр - предприниматель, из 10 - организация. */
export function counterpartyType(inn: string) {
  return inn.replace(/\D/g, "").length === 12 ? "ip" : "company";
}

type SecondSide = { type: string; taxCode: string; secondSideName: string; kpp?: string };

function buildSecondSide(clientInn: string, clientName: string, clientKpp?: string) {
  const type = counterpartyType(clientInn);
  const side: SecondSide = { type, taxCode: clientInn, secondSideName: clientName };
  // КПП есть только у юрлиц
  if (clientKpp && type === "company") side.kpp = clientKpp;
  return side;
}

// --------------------------------------------------------------- счета

export type InvoiceInput = {
  items: DocumentItem[];
  clientName: string;
  clientInn: string;
  clientKpp?: string;
  invoiceNumber: string;
  accountId?: string;
  /** Срок оплаты, YYYY-MM-DD */
  paymentExpiryDate?: string;
};

type CreatedDocument = { Data?: { documentId?: string } };

export async function createInvoice(input: InvoiceInput) {
  const { positions, totalAmount } = buildPositions(input.items);
  const customerCode = await getCustomerCode();
  if (!customerCode) throw new TochkaError("Не выбрана компания в настройках интеграции");

  // Срок оплаты - поле самого счёта (Content.Invoice), не верхнего уровня
  const invoice: Record<string, unknown> = {
    number: input.invoiceNumber,
    totalAmount,
    Positions: positions,
  };
  if (input.paymentExpiryDate) invoice.paymentExpiryDate = input.paymentExpiryDate;

  const body: Record<string, unknown> = {
    customerCode,
    accountId: input.accountId || (await getDefaultAccountId()),
    SecondSide: buildSecondSide(input.clientInn, input.clientName, input.clientKpp),
    Content: { Invoice: invoice },
  };

  const r = await request<CreatedDocument>("/invoice/v1.0/bills", {
    method: "POST",
    body: { Data: body },
  });

  return { documentId: r.Data?.documentId ?? "", totalAmount };
}

/** Код компании для пути запроса; без выбранной компании пути не собрать. */
function customerPath(code: string | null) {
  if (!code) throw new TochkaError("Не выбрана компания в настройках интеграции");
  return encodeURIComponent(code);
}

export async function getInvoicePdf(documentId: string) {
  const code = await getCustomerCode();
  return requestBinary(`/invoice/v1.0/bills/${customerPath(code)}/${encodeURIComponent(documentId)}/file`);
}

/** Значения paymentStatus и их смысл - в lib/tochka-status.ts. */
export type PaymentStatus = {
  Data?: { paymentStatus?: string; status?: string; paidAt?: string };
};

export async function getInvoicePaymentStatus(documentId: string) {
  const code = await getCustomerCode();
  return request<PaymentStatus>(
    `/invoice/v1.0/bills/${customerPath(code)}/${encodeURIComponent(documentId)}/payment-status`,
  );
}

export async function sendInvoiceToEmail(documentId: string, email: string) {
  const code = await getCustomerCode();
  return request(`/invoice/v1.0/bills/${customerPath(code)}/${encodeURIComponent(documentId)}/email`, {
    method: "POST",
    body: { Data: { email } },
  });
}

export async function deleteInvoice(documentId: string) {
  const code = await getCustomerCode();
  return request(`/invoice/v1.0/bills/${customerPath(code)}/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

// --------------------------------------------- закрывающие документы

export type ClosingDocumentType = "act" | "upd" | "invoice" | "waybill";

/**
 * Наши типы → ключ объекта в Content. Вид документа банк определяет именно
 * по нему: Act - акт, PackingList - накладная ТОРГ-12, Invoicef -
 * счёт-фактура, Upd - УПД. Отдельного поля documentType у метода нет.
 */
const CONTENT_KEYS: Record<ClosingDocumentType, string> = {
  act: "Act",
  upd: "Upd",
  invoice: "Invoicef",
  waybill: "PackingList",
};

/** Вид УПД: schfdop - с выделенным НДС (заменяет счёт-фактуру), dop - без НДС. */
export type UpdFunction = "schfdop" | "dop";

export type ClosingDocumentInput = {
  items: DocumentItem[];
  clientName: string;
  clientInn: string;
  clientKpp?: string;
  documentNumber: string;
  accountId?: string;
  /** documentId счёта в банке, к которому привязывается документ */
  linkedInvoiceId?: string;
  /** Только для УПД. Не задан - schfdop, если в позициях есть НДС, иначе dop */
  updFunction?: UpdFunction;
};

export async function createClosingDocument(
  type: ClosingDocumentType,
  input: ClosingDocumentInput,
) {
  const { positions, totalAmount } = buildPositions(input.items);
  const customerCode = await getCustomerCode();
  if (!customerCode) throw new TochkaError("Не выбрана компания в настройках интеграции");

  const content: Record<string, unknown> = {
    number: input.documentNumber,
    totalAmount,
    Positions: positions,
  };
  // У УПД вид (function) обязателен
  if (type === "upd") {
    content.function =
      input.updFunction ??
      (positions.some((p) => p.ndsKind !== "without_nds") ? "schfdop" : "dop");
  }

  const body: Record<string, unknown> = {
    customerCode,
    accountId: input.accountId || (await getDefaultAccountId()),
    SecondSide: buildSecondSide(input.clientInn, input.clientName, input.clientKpp),
    Content: { [CONTENT_KEYS[type]]: content },
  };
  // Родительский документ (счёт) - Data.documentId
  if (input.linkedInvoiceId) body.documentId = input.linkedInvoiceId;

  const r = await request<CreatedDocument>("/invoice/v1.0/closing-documents", {
    method: "POST",
    body: { Data: body },
  });

  return { documentId: r.Data?.documentId ?? "", totalAmount };
}

export async function getClosingDocumentPdf(documentId: string) {
  const code = await getCustomerCode();
  return requestBinary(
    `/invoice/v1.0/closing-documents/${customerPath(code)}/${encodeURIComponent(documentId)}/file`,
  );
}

export async function sendClosingDocumentToEmail(documentId: string, email: string) {
  const code = await getCustomerCode();
  return request(
    `/invoice/v1.0/closing-documents/${customerPath(code)}/${encodeURIComponent(documentId)}/email`,
    { method: "POST", body: { Data: { email } } },
  );
}
