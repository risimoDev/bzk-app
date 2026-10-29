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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Копейка туда-сюда при сложении numeric - не повод считать закупку недоплаченной. */
const EPS = 0.005;

/**
 * Статус оплаты закупки - только из суммы оплат.
 *
 * Как у заказов (lib/order-money.ts): статус руками не выбирают, он
 * следует за деньгами. Без оплат закупка не оплачена, даже если её сумма
 * нулевая.
 */
export function purchasePaymentState(total: number, paid: number): PaymentStatus {
  if (paid <= EPS) return "unpaid";
  return paid + EPS >= total ? "paid" : "partial";
}

/**
 * Цена единицы с доставкой.
 *
 * Доставка закупки - реальная стоимость материала на складе. Делим её
 * между позициями пропорционально их сумме (дорогой рулон везёт больше
 * доставки, чем пачка скрепок) и затем на заказанное количество:
 * приёмка идёт частями, и каждая принятая единица несёт свою долю.
 */
export function landedUnitPrice(input: {
  unitPrice: number;
  itemTotal: number;
  goodsTotal: number;
  shipping: number;
  quantity: number;
}) {
  const { unitPrice, itemTotal, goodsTotal, shipping, quantity } = input;
  if (!(quantity > 0) || !(goodsTotal > 0) || !(shipping > 0)) return unitPrice;
  return unitPrice + (shipping * (itemTotal / goodsTotal)) / quantity;
}

/**
 * Средневзвешенная цена материала после прихода:
 * (остаток × старая цена + принято × цена закупки) / (остаток + принято).
 *
 * Нет остатка или старой цены - берём цену закупки: считать среднее не с
 * чем. Нулевая цена закупки (позиция заведена без цены) стоимость не
 * меняет: иначе приход «бесплатного» материала обнулил бы цену склада.
 * Округление до копеек, как в materials.cost_per_unit.
 */
export function weightedUnitCost(input: {
  stock: number;
  oldCost: number | null;
  received: number;
  price: number;
}) {
  const { stock, oldCost, received, price } = input;
  if (!(price > 0) || !(received > 0)) return oldCost;
  if (!(stock > 0) || oldCost === null || !(oldCost > 0)) return round2(price);
  return round2((stock * oldCost + received * price) / (stock + received));
}
