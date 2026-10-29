/**
 * Разбор ответа DaData (findById/party) в то, что мы отдаём наружу.
 *
 * Чистый модуль без сети и без env: проверяется на фикстуре в
 * scripts/check-inn.mjs, а тип `PartyInfo` нужен и клиентской форме.
 * Наружу идёт только перечень нужных полей: ответ DaData шире (коды ОКВЭД,
 * финансы, телефоны), и пробрасывать его целиком незачем.
 */

export type PartyStatus =
  | "active"
  | "liquidating"
  | "liquidated"
  | "bankrupt"
  | "reorganizing"
  | "unknown";

export type PartyInfo = {
  inn: string;
  /** У предпринимателя КПП не бывает. */
  kpp: string | null;
  ogrn: string | null;
  kind: "legal" | "individual";
  /** «ООО «Ромашка»», «ИП Иванов Иван Иванович». */
  shortName: string;
  fullName: string;
  /**
   * Юридический адрес одной строкой. У предпринимателя DaData отдаёт
   * только город проживания - это не адрес для документов, поэтому
   * здесь null, а город лежит в `city`.
   */
  address: string | null;
  /** Для подписи «ООО Ромашка, Пермь». */
  city: string | null;
  /** Руководитель организации либо ФИО предпринимателя. */
  manager: string | null;
  status: PartyStatus;
};

/** Подпись статуса для человека. */
export const PARTY_STATUS_TEXT: Record<PartyStatus, string> = {
  active: "Действующая",
  liquidating: "В процессе ликвидации",
  liquidated: "Ликвидирована",
  bankrupt: "Банкротство",
  reorganizing: "Реорганизуется (присоединяется к другому лицу)",
  unknown: "Статус не указан",
};

const STATUS_BY_CODE: Record<string, PartyStatus> = {
  ACTIVE: "active",
  LIQUIDATING: "liquidating",
  LIQUIDATED: "liquidated",
  BANKRUPT: "bankrupt",
  REORGANIZING: "reorganizing",
};

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Строка без лишних пробелов и не длиннее предела колонок формы. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s === "" ? null : s.slice(0, max);
}

function digits(v: unknown, len: number): string | null {
  return typeof v === "string" && new RegExp(`^\\d{${len}}$`).test(v) ? v : null;
}

/**
 * Прямые кавычки в названии DaData (ООО "Ромашка") - в «ёлочки», как
 * принято в документах. Только если кавычек ровно две: во вложенных
 * названиях угадывать расстановку не берёмся и оставляем как есть.
 */
export function guillemets(name: string): string {
  const quotes = name.match(/"/g)?.length ?? 0;
  if (quotes !== 2) return name;
  return name.replace('"', "«").replace('"', "»");
}

/** Одна запись ответа или null, если она не того вида. */
function parseItem(item: unknown): PartyInfo | null {
  const data = obj(obj(item)?.data);
  if (!data) return null;

  const inn = digits(data.inn, 10) ?? digits(data.inn, 12);
  if (!inn) return null;

  const kind = data.type === "INDIVIDUAL" || inn.length === 12 ? "individual" : "legal";

  const name = obj(data.name);
  const shortRaw = text(name?.short_with_opf, 255) ?? text(obj(item)?.value, 255);
  const fullRaw = text(name?.full_with_opf, 255) ?? shortRaw;
  if (!shortRaw || !fullRaw) return null;

  const addr = obj(data.address);
  // unrestricted_value - с индексом, как нужно в документах
  const addressLine = text(addr?.unrestricted_value, 1000) ?? text(addr?.value, 1000);
  const addrData = obj(addr?.data);
  const city =
    text(addrData?.city, 100) ?? text(addrData?.settlement, 100) ?? text(addrData?.region, 100);

  let manager = text(obj(data.management)?.name, 255);
  if (kind === "individual") {
    const fio = obj(data.fio);
    const joined = [fio?.surname, fio?.name, fio?.patronymic]
      .map((p) => text(p, 100))
      .filter(Boolean)
      .join(" ");
    manager = joined || manager;
  }

  const state = obj(data.state);
  const status =
    typeof state?.status === "string" && Object.hasOwn(STATUS_BY_CODE, state.status)
      ? STATUS_BY_CODE[state.status]
      : "unknown";

  return {
    inn,
    kpp: kind === "legal" ? digits(data.kpp, 9) : null,
    ogrn: digits(data.ogrn, 13) ?? digits(data.ogrn, 15),
    kind,
    shortName: guillemets(shortRaw),
    fullName: guillemets(fullRaw),
    address: kind === "legal" ? addressLine : null,
    // У предпринимателя address.value - город проживания
    city: kind === "legal" ? city : (city ?? text(addr?.value, 100)),
    manager,
    status,
  };
}

/**
 * Подходящая запись ответа или null, если организации нет либо ответ не
 * того вида. По одному ИНН DaData отдаёт несколько записей (головная
 * организация, филиалы, закрытые): берём первую действующую, а если
 * действующих нет - первую подходящую. Никогда не бросает: тело чужого
 * сервиса - данные, а не гарантия.
 */
export function parseParty(body: unknown): PartyInfo | null {
  const list = obj(body)?.suggestions;
  if (!Array.isArray(list)) return null;

  let first: PartyInfo | null = null;
  for (const item of list) {
    const parsed = parseItem(item);
    if (!parsed) continue;
    if (parsed.status === "active") return parsed;
    first ??= parsed;
  }
  return first;
}

/** Подпись для подтверждения: «ООО «Ромашка», Пермь». */
export function partyLabel(p: Pick<PartyInfo, "shortName" | "city">): string {
  return p.city ? `${p.shortName}, ${p.city}` : p.shortName;
}
