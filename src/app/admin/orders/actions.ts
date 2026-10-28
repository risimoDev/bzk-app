"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  chatMessages,
  externalOrders,
  orderChats,
  clientUploads,
  orderItems,
  orders,
  products,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyOrderMessage, notifyOrderStatus, notifyUser } from "@/lib/notify";
import { ORDER_STATUS, isOrderStatus } from "@/lib/order-status";
import {
  MoneyRuleError,
  changeOrderStatus,
  recalcOrderMoney,
  setSiteOrderUrgent,
} from "@/lib/order-money-db";
import { esc } from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";

export type StatusState = { ok?: boolean; error?: string; message?: string };

/** Страницы, где видны статус и деньги заказа с сайта. */
function revalidateSiteOrder(id: number) {
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath(`/client/orders/${id}`);
  revalidatePath("/client/orders");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/analytics");
}

/**
 * Смена статуса заказа с сайта.
 *
 * Переходы - по таблице из lib/order-status.ts. Отмена гасит производство
 * и выводит заказ из выручки, снятие отмены возвращает его обратно - это
 * делает changeOrderStatus той же транзакцией. Письмо клиенту - только
 * если статус действительно сменился.
 */
export async function changeStatus(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  // Права проверяем здесь, а не только в разметке: серверное действие
  // вызывается по сети, и спрятанная кнопка ничего не защищает.
  if (!(await can("orders", "edit"))) return { error: "Нет прав менять заказы" };

  const id = Number(formData.get("orderId"));
  const status = String(formData.get("status") ?? "");

  if (!Number.isInteger(id) || id <= 0) return { error: "Заказ не найден" };
  if (!isOrderStatus(status)) return { error: "Неизвестный статус" };

  let result: Awaited<ReturnType<typeof changeOrderStatus>>;
  try {
    result = await db.transaction((tx) =>
      changeOrderStatus(tx, { source: "site", id }, status),
    );
  } catch (e) {
    if (e instanceof MoneyRuleError) return { error: e.message };
    throw e;
  }

  if (!result.changed) return { ok: true, message: "Статус не изменился" };

  await audit("order.status", { type: "order", id }, { from: result.from, status });

  const [order] = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  // Клиент узнаёт о стадии сам - за этим он и заводил кабинет
  if (order) {
    await notifyOrderStatus({
      userId: order.userId,
      orderId: id,
      statusLabel: ORDER_STATUS[status].label,
    });
  }

  revalidateSiteOrder(id);
  revalidatePath("/admin/production");
  return { ok: true, message: `Статус: ${ORDER_STATUS[status].label.toLowerCase()}` };
}

/**
 * Срочность заказа с сайта. Надбавка входит в итог, поэтому итог, доход,
 * налог и статус оплаты пересчитываются той же транзакцией - раньше
 * менялся только флажок, а клиент платил старую сумму.
 */
export async function toggleUrgent(formData: FormData) {
  if (!(await can("orders", "edit"))) return;

  const id = Number(formData.get("orderId"));
  const urgent = formData.get("urgent") === "1";
  if (!Number.isInteger(id) || id <= 0) return;

  const summary = await db.transaction((tx) => setSiteOrderUrgent(tx, id, urgent));
  if (!summary) return;

  await audit("order.urgent", { type: "order", id }, {
    urgent,
    total: summary.income.toFixed(2),
    paymentStatus: summary.status,
  });

  revalidateSiteOrder(id);
}

/** Снимает метку «новый», когда менеджер открыл заказ. */
export async function markSeen(id: number) {
  if (!(await can("orders", "view"))) return;
  await db.update(orders).set({ isNew: false }).where(eq(orders.id, id));
}

export type ChatState = { ok: boolean; message?: string };

/**
 * Ответ менеджера в переписке по заказу.
 *
 * До этого писать мог только клиент, и его сообщения оставались без
 * ответа: в админке переписки не было вовсе.
 */
export async function replyToOrderChat(
  _prev: ChatState,
  formData: FormData,
): Promise<ChatState> {
  const me = await currentUser();
  if (!me || !(await can("orders", "edit"))) {
    return { ok: false, message: "Нет прав отвечать по заказам" };
  }

  const orderId = Number(formData.get("orderId"));
  const message = String(formData.get("message") ?? "").trim();

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, message: "Заказ не найден" };
  }
  if (message === "") return { ok: false, message: "Сообщение пустое" };
  if (message.length > 4000) {
    return { ok: false, message: "Слишком длинное сообщение - до 4000 символов" };
  }

  const [order] = await db
    .select({ id: orders.id, userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, message: "Заказ не найден" };

  await db.transaction(async (tx) => {
    // Ветка заводится при первом сообщении - с любой стороны
    const [existing] = await tx
      .select({ id: orderChats.id })
      .from(orderChats)
      .where(eq(orderChats.orderId, orderId))
      .limit(1);

    const chatId =
      existing?.id ??
      (
        await tx.insert(orderChats).values({ orderId }).returning({ id: orderChats.id })
      )[0].id;

    await tx.insert(chatMessages).values({ chatId, userId: Number(me.id), message });
    await tx
      .update(orderChats)
      .set({ updatedAt: new Date() })
      .where(eq(orderChats.id, chatId));
  });

  await notifyOrderMessage({
    toUserId: order.userId,
    orderId,
    authorName: me.name,
    preview: message,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/client/orders/${orderId}`);
  return { ok: true };
}

// ------------------------------------------------- состав заказа с сайта

export type OrderItemState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Сумма из формы: «1 200,50» и «1200.5» - одно и то же число. */
function parseMoney(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (text === "") return 0;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * Добавить или поправить позицию заказа с сайта.
 *
 * Нужно там, где клиент заказал одно, а по телефону договорились о
 * другом: раньше состав сайтового заказа в админке только показывался.
 */
export async function saveOrderItem(
  _prev: OrderItemState,
  formData: FormData,
): Promise<OrderItemState> {
  if (!(await can("orders", "edit"))) {
    return { ok: false, error: "Нет прав менять заказы" };
  }

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Заказ не найден" };
  }

  const rawItemId = String(formData.get("itemId") ?? "").trim();
  const itemId = rawItemId === "" ? null : Number(rawItemId);
  if (itemId !== null && (!Number.isInteger(itemId) || itemId <= 0)) {
    return { ok: false, error: "Позиция не найдена" };
  }

  const rawProduct = String(formData.get("productId") ?? "").trim();
  const productId = rawProduct === "" ? null : Number(rawProduct);
  if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
    return { ok: false, error: "Товар не найден" };
  }

  const itemName = String(formData.get("itemName") ?? "").trim().slice(0, 255);
  if (productId === null && itemName.length < 2) {
    return { ok: false, error: "Выберите товар или впишите название" };
  }

  const quantity = Number(String(formData.get("quantity") ?? "").trim());
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Количество - целое число больше нуля" };
  }

  const unitPrice = parseMoney(formData.get("unitPrice"));
  if (Number.isNaN(unitPrice)) return { ok: false, error: "Цена вида 1234.56" };

  if (productId !== null) {
    const [exists] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!exists) return { ok: false, error: "Товар не найден" };
  }

  const values = {
    productId,
    isCustom: productId === null,
    itemName: productId === null ? itemName : null,
    itemNote: String(formData.get("itemNote") ?? "").trim().slice(0, 2000) || null,
    quantity,
    unitPrice: unitPrice.toFixed(2),
    // Колонка price хранит сумму строки целиком - так же, как у заказов
    // менеджера
    price: round2(unitPrice * quantity).toFixed(2),
  };

  const done = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return null;

    if (itemId === null) {
      await tx.insert(orderItems).values({ ...values, orderId });
    } else {
      const rows = await tx
        .update(orderItems)
        .set(values)
        .where(
          and(
            eq(orderItems.id, itemId),
            // Номер позиции приходит из формы: без проверки заказа можно
            // было бы отредактировать чужую строку
            eq(orderItems.orderId, orderId),
          ),
        )
        .returning({ id: orderItems.id });
      if (rows.length === 0) return null;
    }

    // Итог (с надбавкой и скидкой), себестоимость и статус оплаты -
    // заново: оплаченный заказ после новой позиции оплачен частично
    return recalcOrderMoney(
      tx,
      { source: "site", id: orderId },
      { rebuildTotal: true, refreshEstimate: true },
    );
  });

  if (!done) return { ok: false, error: "Заказ или позиция не найдены" };

  await audit(
    itemId === null ? "order.item_add" : "order.item_update",
    { type: "order", id: orderId },
    { itemId, price: values.price, total: done.income.toFixed(2), paymentStatus: done.status },
  );

  revalidateSiteOrder(orderId);
  return { ok: true, message: itemId === null ? "Позиция добавлена" : "Позиция сохранена" };
}

export async function deleteOrderItem(
  _prev: OrderItemState,
  formData: FormData,
): Promise<OrderItemState> {
  if (!(await can("orders", "edit"))) {
    return { ok: false, error: "Нет прав менять заказы" };
  }

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    return { ok: false, error: "Позиция не найдена" };
  }

  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      .returning({ id: orderItems.id });

    if (rows.length === 0) return null;
    return recalcOrderMoney(
      tx,
      { source: "site", id: orderId },
      { rebuildTotal: true, refreshEstimate: true },
    );
  });

  if (!removed) return { ok: false, error: "Позиция не найдена" };

  await audit("order.item_delete", { type: "order", id: orderId }, {
    itemId,
    total: removed.income.toFixed(2),
    paymentStatus: removed.status,
  });
  revalidateSiteOrder(orderId);
  return { ok: true, message: "Позиция удалена" };
}

// ------------------------------------- показ документов клиенту

export type DocumentsState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

/**
 * Открыть или скрыть счёт и УПД для клиента.
 *
 * Документы выставляются, когда состав и сумма согласованы: до этого
 * клиент увидел бы черновик и заплатил бы не ту сумму. Поэтому по
 * умолчанию выключено, а включает менеджер.
 */
export async function setDocumentsVisible(
  _prev: DocumentsState,
  formData: FormData,
): Promise<DocumentsState> {
  if (!(await can("orders", "edit"))) {
    return { error: "Нет прав менять заказы" };
  }

  const source = String(formData.get("source") ?? "");
  const orderId = Number(formData.get("orderId"));
  const visible = String(formData.get("visible") ?? "") === "1";

  if (source !== "site" && source !== "external") {
    return { error: "Неизвестный тип заказа" };
  }
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "Заказ не найден" };
  }

  const updated =
    source === "site"
      ? await db
          .update(orders)
          .set({ documentsVisible: visible })
          .where(eq(orders.id, orderId))
          .returning({ id: orders.id })
      : await db
          .update(externalOrders)
          .set({ documentsVisible: visible })
          .where(eq(externalOrders.id, orderId))
          .returning({ id: externalOrders.id });

  if (updated.length === 0) return { error: "Заказ не найден" };

  await audit("order.documents_visible", {
    type: source === "site" ? "order" : "external_order",
    id: orderId,
  }, { visible });

  if (source === "site") {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/client/orders/${orderId}`);
  } else {
    revalidatePath(`/admin/external-orders/${orderId}`);
    revalidatePath(`/client/orders/external/${orderId}`);
  }

  return {
    ok: true,
    message: visible ? "Документы открыты клиенту" : "Документы скрыты",
  };
}

// ------------------------------------------------ приёмка макетов

/**
 * Вердикт менеджера по загруженному клиентом макету.
 *
 * Клиент грузит файл, менеджер смотрит и решает: годится в печать,
 * нужны правки или не подходит. Для «нужны правки» и «отклонить»
 * комментарий обязателен - иначе клиент не поймёт, что не так.
 *
 * Статус и комментарий видны клиенту в карточке заказа и в разделе
 * файлов; о смене вердикта ему уходит уведомление.
 */
const REVIEW_STATUSES = ["approved", "revision", "rejected"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  approved: "принят в печать",
  revision: "отправлен на доработку",
  rejected: "отклонён",
};

export async function reviewClientUpload(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  if (!(await can("orders", "edit"))) {
    return { error: "У вашей роли нет права принимать макеты" };
  }

  const fileId = Number(formData.get("fileId"));
  const raw = String(formData.get("status") ?? "");
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 500);

  if (!Number.isInteger(fileId) || fileId <= 0) return { error: "Файл не найден" };
  if (!REVIEW_STATUSES.includes(raw as ReviewStatus)) return { error: "Неизвестный вердикт" };
  const status = raw as ReviewStatus;

  // Правки и отказ без объяснения бесполезны клиенту
  if (status !== "approved" && comment === "") {
    return { error: "Напишите, что не так с макетом" };
  }

  const [file] = await db
    .select({
      id: clientUploads.id,
      userId: clientUploads.userId,
      orderId: clientUploads.orderId,
      name: clientUploads.originalName,
    })
    .from(clientUploads)
    .where(eq(clientUploads.id, fileId))
    .limit(1);
  if (!file) return { error: "Файл не найден" };

  await db
    .update(clientUploads)
    .set({ status, adminComment: comment || null, updatedAt: new Date() })
    .where(eq(clientUploads.id, fileId));

  await audit("upload.review", { type: "client_upload", id: fileId }, { status });

  // Клиенту - уведомление: вердикт по макету он ждёт, чтобы двигаться дальше
  await notifyUser(
    file.userId,
    "upload_reviewed",
    "Макет проверен",
    `<b>Макет «${esc(file.name)}» ${REVIEW_LABEL[status]}</b>` +
      (comment ? `\n${esc(comment)}` : "") +
      (file.orderId ? `\nЗаказ № ${file.orderId}` : ""),
    file.orderId
      ? [[{ text: "Открыть заказ", url: absoluteUrl(`/client/orders/${file.orderId}`) }]]
      : undefined,
  );

  if (file.orderId) revalidatePath(`/admin/orders/${file.orderId}`);
  revalidatePath("/admin/orders");
  if (file.orderId) revalidatePath(`/client/orders/${file.orderId}`);
  revalidatePath("/client/uploads");

  return { ok: true };
}
