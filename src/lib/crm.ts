/**
 * CRM: лиды, взаимодействия и напоминания.
 *
 * Перенесено из admin/crm. Лид - обращение, из которого ещё не вышел
 * заказ: он движется по воронке от «новый» до «выиграли» или «проиграли».
 */

export const LEAD_STATUS = {
  new: { label: "Новый", className: "bg-ink/10 text-ink/70", order: 0 },
  contacted: { label: "Связались", className: "bg-navy/12 text-navy", order: 1 },
  qualified: { label: "Квалифицирован", className: "bg-navy/15 text-navy", order: 2 },
  proposal: { label: "Отправили КП", className: "bg-warn/15 text-warn", order: 3 },
  negotiation: { label: "Торгуемся", className: "bg-warn/20 text-warn", order: 4 },
  won: { label: "Выиграли", className: "bg-ok/15 text-ok", order: 5 },
  lost: { label: "Проиграли", className: "bg-danger/12 text-danger", order: 6 },
} as const;

export type LeadStatus = keyof typeof LEAD_STATUS;

export function leadStatus(value: string | null) {
  return LEAD_STATUS[(value ?? "new") as LeadStatus] ?? LEAD_STATUS.new;
}

/** Порядок колонок воронки. Выигранные и проигранные - в конце. */
export const PIPELINE: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

/** Сделка закрыта - двигать её по воронке больше некуда. */
export function isLeadClosed(status: string | null) {
  return status === "won" || status === "lost";
}

export const LEAD_SOURCE = {
  website: "Сайт",
  phone: "Звонок",
  email: "Почта",
  telegram: "Телеграм",
  referral: "По рекомендации",
  cold_call: "Холодный обзвон",
  advertising: "Реклама",
  other: "Другое",
} as const;

export type LeadSource = keyof typeof LEAD_SOURCE;

export function leadSource(value: string | null) {
  return LEAD_SOURCE[(value ?? "website") as LeadSource] ?? LEAD_SOURCE.other;
}

export const LEAD_PRIORITY = {
  low: { label: "Низкий", className: "text-ink/45" },
  medium: { label: "Обычный", className: "text-ink/60" },
  high: { label: "Высокий", className: "text-warn" },
  urgent: { label: "Срочно", className: "text-danger" },
} as const;

export type LeadPriority = keyof typeof LEAD_PRIORITY;

export function leadPriority(value: string | null) {
  return LEAD_PRIORITY[(value ?? "medium") as LeadPriority] ?? LEAD_PRIORITY.medium;
}

export const INTERACTION_TYPE = {
  call: "Звонок",
  email: "Письмо",
  meeting: "Встреча",
  telegram: "Телеграм",
  note: "Заметка",
  task: "Задача",
  order: "Заказ",
} as const;

export type InteractionType = keyof typeof INTERACTION_TYPE;

export function interactionType(value: string | null) {
  return INTERACTION_TYPE[(value ?? "note") as InteractionType] ?? INTERACTION_TYPE.note;
}

export const INTERACTION_DIRECTION = {
  incoming: "входящий",
  outgoing: "исходящий",
} as const;

/**
 * Направление имеет смысл только у звонков и писем: у встречи или
 * заметки «входящая» не бывает.
 */
export function hasDirection(type: string) {
  return type === "call" || type === "email" || type === "telegram";
}

/** Теги лида хранятся одной строкой через запятую. */
export function readTags(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}
