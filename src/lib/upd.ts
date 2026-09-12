import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  externalOrderItems,
  externalOrders,
  orders,
  orderItems,
  products,
  users,
} from "@/db/schema";
import { type Company } from "@/lib/company";
import { readCompany } from "@/lib/company-db";
import { parseContact } from "@/lib/order-contact";
import { rublesInWords } from "@/lib/num2words";

/**
 * Данные универсального передаточного документа по заказу.
 *
 * Форма - приложение № 1 к постановлению Правительства РФ от 26.12.2011
 * № 1137 (в редакции от 16.08.2024 № 1096). Работаем на УСН, поэтому НДС
 * во всех строках «Без НДС», а статус документа - 2: только передаточный
 * документ (акт). Старый шаблон печатал статус 1 («счёт-фактура и
 * передаточный документ»), хотя счёт-фактуру на упрощёнке не выставляют.
 */

export type UpdRow = {
  index: number;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  sum: number;
};

/**
 * Откуда заказ: с витрины или заведён менеджером. Заказов второго вида
 * в базе на два порядка больше, и печатать документы по ним нужно так же.
 */
export type OrderSource = "site" | "external";

export type UpdData = {
  order: {
    id: number;
    source: OrderSource;
    createdAt: Date | null;
    totalPrice: number;
    isUrgent: boolean;
  };
  seller: Company;
  buyer: {
    name: string;
    address: string;
    inn: string;
    kpp: string;
    isCorporate: boolean;
  };
  rows: UpdRow[];
  totalQuantity: number;
  totalSum: number;
  /** Сумма позиций разошлась с суммой заказа - например, из-за срочной надбавки */
  extra: number;
  /** Чем объясняется расхождение, если это известно из данных заказа */
  extraLabel: string;
  amountInWords: string;
  documentNumber: string;
  documentDate: Date;
};

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «05» сентября 2026 г. - как принято подписывать первичку. */
export function longDate(d: Date) {
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

/**
 * Данные документа по заказу.
 *
 * Номера в `orders` и `external_orders` идут своими последовательностями
 * и пересекаются, поэтому источник обязателен: без него «заказ № 17»
 * означает два разных заказа.
 */
export async function buildUpd(
  source: OrderSource,
  orderId: number,
): Promise<UpdData | null> {
  return source === "site" ? buildSiteUpd(orderId) : buildExternalUpd(orderId);
}

async function buildSiteUpd(orderId: number): Promise<UpdData | null> {
  const [order] = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      totalPrice: orders.totalPrice,
      isUrgent: orders.isUrgent,
      shippingAddress: orders.shippingAddress,
      contactInfo: orders.contactInfo,
      clientName: users.name,
      companyName: users.companyName,
      inn: users.inn,
      kpp: users.kpp,
      legalAddress: users.legalAddress,
      isCorporate: users.isCorporate,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select({
      id: orderItems.id,
      itemName: orderItems.itemName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      price: orderItems.price,
      productName: products.name,
      unit: products.unit,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  const seller = await readCompany();
  const contact = parseContact(order.contactInfo);

  const isCorporate = Boolean(order.isCorporate);
  const buyer = {
    name:
      (isCorporate && order.companyName?.trim()) ||
      order.clientName?.trim() ||
      contact?.name ||
      "Покупатель не указан",
    address:
      (isCorporate && order.legalAddress?.trim()) ||
      order.shippingAddress?.trim() ||
      "Адрес не указан",
    inn: order.inn?.trim() ?? "",
    kpp: order.kpp?.trim() ?? "",
    isCorporate,
  };

  const rows: UpdRow[] = items.map((it, i) => {
    // price в позиции - это стоимость всей строки, unit_price - за штуку.
    // У старых заказов unit_price пустой, тогда делим сумму на количество
    const sum = Number(it.price);
    const quantity = it.quantity;
    const price = it.unitPrice !== null ? Number(it.unitPrice) : quantity > 0 ? sum / quantity : 0;

    return {
      index: i + 1,
      name: it.productName ?? it.itemName ?? "Без названия",
      unit: it.unit ?? "шт",
      quantity,
      price: +price.toFixed(2),
      sum: +sum.toFixed(2),
    };
  });

  const totalSum = +rows.reduce((s, r) => s + r.sum, 0).toFixed(2);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const orderTotal = Number(order.totalPrice);

  // Надбавка за срочность и доставка в позиции заказа не попадают, а в
  // документе сумма обязана сойтись с тем, что клиент платит
  const extra = +(orderTotal - totalSum).toFixed(2);

  // Надбавку за срочность заказ хранит в contact_info - если она сходится
  // с расхождением, строку можно назвать честно, а не «прочее»
  const urgentFee = contact?.urgentFee ?? 0;
  const extraLabel =
    extra > 0 && Math.abs(extra - urgentFee) < 0.01
      ? "Надбавка за срочное изготовление"
      : extra > 0
        ? "Дополнительные работы по заказу"
        : "Корректировка стоимости";

  return {
    order: {
      id: order.id,
      source: "site",
      createdAt: order.createdAt,
      totalPrice: orderTotal,
      isUrgent: order.isUrgent,
    },
    seller,
    buyer,
    rows,
    totalQuantity,
    totalSum,
    extra,
    extraLabel,
    amountInWords: rublesInWords(orderTotal),
    documentNumber: String(order.id),
    documentDate: order.createdAt ?? new Date(),
  };
}

/**
 * То же для заказа менеджера.
 *
 * Реквизиты покупателя берём из контрагента, если он выбран: в самом
 * заказе лежит только имя строкой - слепок на момент заказа. Номер
 * документа помечаем буквой «М», чтобы он не совпал с номером сайтового
 * заказа: в бухгалтерии это два разных документа.
 */
async function buildExternalUpd(orderId: number): Promise<UpdData | null> {
  const [order] = await db
    .select({
      id: externalOrders.id,
      createdAt: externalOrders.createdAt,
      totalPrice: externalOrders.totalPrice,
      clientName: externalOrders.clientName,
      address: externalOrders.address,
      companyName: clients.companyName,
      inn: clients.inn,
      clientAddress: clients.address,
    })
    .from(externalOrders)
    .leftJoin(clients, eq(clients.id, externalOrders.clientId))
    .where(eq(externalOrders.id, orderId))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select({
      id: externalOrderItems.id,
      itemName: externalOrderItems.itemName,
      quantity: externalOrderItems.quantity,
      price: externalOrderItems.price,
      productName: products.name,
      unit: products.unit,
    })
    .from(externalOrderItems)
    .leftJoin(products, eq(externalOrderItems.productId, products.id))
    .where(eq(externalOrderItems.externalOrderId, orderId))
    .orderBy(asc(externalOrderItems.id));

  const seller = await readCompany();

  // Организация у контрагента - единственный признак юрлица, который у
  // нас есть: КПП контрагентам не заводим
  const isCorporate = Boolean(order.companyName?.trim() || order.inn?.trim());

  const rows: UpdRow[] = items.map((it, i) => {
    // price в позиции - сумма всей строки, отдельной цены за штуку у
    // менеджерских заказов нет
    const sum = Number(it.price);
    const quantity = it.quantity;
    const price = quantity > 0 ? sum / quantity : 0;

    return {
      index: i + 1,
      name: it.productName ?? it.itemName ?? "Без названия",
      unit: it.unit ?? "шт",
      quantity,
      price: +price.toFixed(2),
      sum: +sum.toFixed(2),
    };
  });

  const totalSum = +rows.reduce((s, r) => s + r.sum, 0).toFixed(2);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const orderTotal = Number(order.totalPrice);
  const extra = +(orderTotal - totalSum).toFixed(2);

  return {
    order: {
      id: order.id,
      source: "external",
      createdAt: order.createdAt,
      totalPrice: orderTotal,
      isUrgent: false,
    },
    seller,
    buyer: {
      name:
        order.companyName?.trim() ||
        order.clientName?.trim() ||
        "Покупатель не указан",
      address:
        order.address?.trim() || order.clientAddress?.trim() || "Адрес не указан",
      inn: order.inn?.trim() ?? "",
      kpp: "",
      isCorporate,
    },
    rows,
    totalQuantity,
    totalSum,
    extra,
    extraLabel:
      extra > 0 ? "Дополнительные работы по заказу" : "Корректировка стоимости",
    amountInWords: rublesInWords(orderTotal),
    documentNumber: `${order.id}-М`,
    documentDate: order.createdAt ?? new Date(),
  };
}
