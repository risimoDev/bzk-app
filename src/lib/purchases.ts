/** Статусы закупок - подписи и цвета. */

export type PurchaseStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "in_delivery"
  | "partially_received"
  | "received"
  | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export const PURCHASE_STATUS: Record<
  PurchaseStatus,
  { label: string; className: string }
> = {
  draft: { label: "Черновик", className: "bg-ink/10 text-ink/60" },
  sent: { label: "Отправлена", className: "bg-navy/12 text-navy" },
  confirmed: { label: "Подтверждена", className: "bg-navy/12 text-navy" },
  in_delivery: { label: "В пути", className: "bg-warn/15 text-warn" },
  partially_received: {
    label: "Принята частично",
    className: "bg-warn/15 text-warn",
  },
  received: { label: "Принята", className: "bg-ok/15 text-ok" },
  cancelled: { label: "Отменена", className: "bg-danger/12 text-danger" },
};

export const PAYMENT_STATUS: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  unpaid: { label: "Не оплачена", className: "text-danger" },
  partial: { label: "Оплачена частично", className: "text-warn" },
  paid: { label: "Оплачена", className: "text-ok" },
};

export const purchaseStatusOf = (v: string | null) =>
  PURCHASE_STATUS[(v ?? "draft") as PurchaseStatus] ?? PURCHASE_STATUS.draft;

export const paymentStatusOf = (v: string | null) =>
  PAYMENT_STATUS[(v ?? "unpaid") as PaymentStatus] ?? PAYMENT_STATUS.unpaid;

/** Статусы, при которых закупку ещё можно принимать на склад. */
export const RECEIVABLE: PurchaseStatus[] = [
  "sent",
  "confirmed",
  "in_delivery",
  "partially_received",
];
