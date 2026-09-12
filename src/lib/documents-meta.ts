/**
 * Словари документооборота.
 *
 * Лежат отдельно от documents.ts потому, что тот помечен server-only:
 * там живёт очистка HTML, а подписи нужны и формам в браузере.
 */

export const DOC_STATUS = {
  draft: { label: "Черновик", className: "bg-ink/10 text-ink/60" },
  pending: { label: "На согласовании", className: "bg-navy/12 text-navy" },
  approved: { label: "Согласован", className: "bg-ok/15 text-ok" },
  signed: { label: "Подписан", className: "bg-ok/20 text-ok" },
  cancelled: { label: "Отменён", className: "bg-danger/12 text-danger" },
  archived: { label: "В архиве", className: "bg-ink/8 text-ink/45" },
} as const;

export type DocStatus = keyof typeof DOC_STATUS;

export function docStatus(value: string | null) {
  return DOC_STATUS[(value ?? "draft") as DocStatus] ?? DOC_STATUS.draft;
}

export const DOC_TYPE = {
  incoming: "Входящий",
  internal: "Внутренний",
  outgoing: "Исходящий",
  accounting: "Учётный",
} as const;

export function docType(value: string | null) {
  return DOC_TYPE[(value ?? "internal") as keyof typeof DOC_TYPE] ?? DOC_TYPE.internal;
}

/** Действия из document_history по-русски. */
export const DOC_ACTIONS: Record<string, string> = {
  created: "создан",
  updated: "изменён",
  status_changed: "смена статуса",
  signed: "подписан",
  viewed: "просмотр",
  downloaded: "скачан",
};
