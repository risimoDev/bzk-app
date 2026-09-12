/**
 * Личный кабинет: правила загрузки файлов и словари обращений.
 *
 * Перенесено из includes/services/ClientPortalService.php. Здесь только
 * константы и разбор - работа с диском и базой лежит в client-portal-db.ts,
 * потому что этот файл подключают клиентские компоненты форм.
 */

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

/**
 * Что принимаем в макетах. Список тот же, что на старом сайте: рабочие
 * форматы вёрстки, растр под печать и архивы, если файлов несколько.
 */
export const ALLOWED_EXTENSIONS = [
  "pdf", "ai", "eps", "psd", "cdr",
  "jpg", "jpeg", "png", "tif", "tiff", "svg",
  "zip", "rar",
] as const;

/** Для атрибута accept у поля выбора файла. */
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export const UPLOAD_STATUS = {
  pending: { label: "На проверке", className: "bg-navy/12 text-navy" },
  approved: { label: "Принят", className: "bg-ok/15 text-ok" },
  rejected: { label: "Отклонён", className: "bg-danger/12 text-danger" },
  revision: { label: "Нужны правки", className: "bg-warn/15 text-warn" },
} as const;

export type UploadStatus = keyof typeof UPLOAD_STATUS;

export function uploadStatus(value: string | null) {
  return UPLOAD_STATUS[(value ?? "pending") as UploadStatus] ?? UPLOAD_STATUS.pending;
}

export const TICKET_CATEGORIES = {
  order_issue: "Проблема с заказом",
  delivery: "Доставка",
  payment: "Оплата",
  quality: "Качество",
  design: "Дизайн и макет",
  general: "Общий вопрос",
} as const;

export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export const TICKET_PRIORITIES = {
  low: { label: "Низкий", className: "bg-ink/10 text-ink/55" },
  normal: { label: "Обычный", className: "bg-ink/10 text-ink/60" },
  high: { label: "Высокий", className: "bg-warn/15 text-warn" },
  urgent: { label: "Срочный", className: "bg-danger/12 text-danger" },
} as const;

export type TicketPriority = keyof typeof TICKET_PRIORITIES;

export const TICKET_STATUSES = {
  open: { label: "Открыт", className: "bg-navy/12 text-navy" },
  in_progress: { label: "В работе", className: "bg-warn/15 text-warn" },
  waiting_client: { label: "Ждём вашего ответа", className: "bg-brand/12 text-brand" },
  resolved: { label: "Решён", className: "bg-ok/15 text-ok" },
  closed: { label: "Закрыт", className: "bg-ink/10 text-ink/45" },
} as const;

export type TicketStatus = keyof typeof TICKET_STATUSES;

export function ticketStatus(value: string | null) {
  return TICKET_STATUSES[(value ?? "open") as TicketStatus] ?? TICKET_STATUSES.open;
}

export function ticketPriority(value: string | null) {
  return TICKET_PRIORITIES[(value ?? "normal") as TicketPriority] ?? TICKET_PRIORITIES.normal;
}

/** Обращение закрыто - переписку в нём продолжать нельзя. */
export function isTicketClosed(status: string | null) {
  return status === "closed" || status === "resolved";
}

/**
 * То же состояние, но словом среднего рода: «обращение решено», а не
 * «обращение решён». Названия статусов в списке отвечают на «какой?»,
 * и в предложении о самом обращении не согласуются.
 */
export function ticketClosedWord(status: string | null) {
  return status === "resolved" ? "решено" : "закрыто";
}

export const WAREHOUSE_STATUS = {
  in_stock: { label: "На складе", className: "bg-ok/15 text-ok" },
  in_production: { label: "В работе", className: "bg-warn/15 text-warn" },
  shipped: { label: "Отгружено", className: "bg-navy/12 text-navy" },
  returned: { label: "Возврат", className: "bg-ink/10 text-ink/55" },
} as const;

export type WarehouseStatus = keyof typeof WAREHOUSE_STATUS;

export function warehouseStatus(value: string | null) {
  return WAREHOUSE_STATUS[(value ?? "in_stock") as WarehouseStatus] ?? WAREHOUSE_STATUS.in_stock;
}

/** Расширение в нижнем регистре, без точки. */
export function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function isAllowedExtension(filename: string) {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

/** Размер файла человеческими словами. */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
