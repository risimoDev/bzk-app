import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc, desc, sql } from "drizzle-orm";
import { ArrowLeft, Mail, Phone, MapPin, Flame, Receipt, FileSignature } from "lucide-react";
import { db } from "@/db";
import {
  orders,
  orderItems,
  users,
  products,
  clientUploads,
  ordersAccounting,
  orderPayments,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { statusOf } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { parseContact } from "@/lib/order-contact";
import { toggleUrgent } from "../actions";
import { formatOrderAttribute, parseOrderAttributes } from "@/lib/order-attributes";
import { StatusForm } from "./StatusForm";
import { readOrderMessages } from "@/lib/order-chat";
import { OrderChat } from "./OrderChat";
import { DeleteOrderItemButton, OrderItemForm } from "./OrderItemForm";
import { DocumentsToggle } from "../DocumentsToggle";
import { ProofReview } from "./ProofReview";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";
import { paymentStateOf } from "@/lib/finance";
import { debtOf } from "@/lib/order-money";
import { ReturnWriteOffButton, WriteOffForm } from "@/app/admin/materials/WriteOffForm";
import { activeMaterialOptions, listWriteOffs } from "@/lib/write-off-db";

export const metadata: Metadata = {
  title: "Заказ · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminOrder(props: PageProps<"/admin/orders/[id]">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Заказ">
        <AdminEmpty title="Нет доступа" />
      </AdminPage>
    );
  }

  const { id } = await props.params;
  const orderId = parseId(id);
  if (orderId === null) notFound();

  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.totalPrice,
      createdAt: orders.createdAt,
      readyDate: orders.readyDate,
      isUrgent: orders.isUrgent,
      documentsVisible: orders.documentsVisible,
      shippingAddress: orders.shippingAddress,
      contactInfo: orders.contactInfo,
      clientId: users.id,
      clientName: users.name,
      clientEmail: users.email,
      clientPhone: users.phone,
      companyName: users.companyName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) notFound();

  const items = await db
    .select({
      id: orderItems.id,
      itemName: orderItems.itemName,
      itemNote: orderItems.itemNote,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      price: orderItems.price,
      attributes: orderItems.attributes,
      isCustom: orderItems.isCustom,
      productId: orderItems.productId,
      productName: products.name,
      unit: products.unit,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  // Макеты, которые клиент приложил к заказу: менеджер их принимает
  const proofs = await db
    .select({
      id: clientUploads.id,
      originalName: clientUploads.originalName,
      description: clientUploads.description,
      status: clientUploads.status,
      adminComment: clientUploads.adminComment,
      fileSize: clientUploads.fileSize,
      createdAt: clientUploads.createdAt,
    })
    .from(clientUploads)
    .where(eq(clientUploads.orderId, orderId))
    .orderBy(desc(clientUploads.createdAt));

  const st = statusOf(order.status);
  const editable = await can("orders", "edit");
  const messages = await readOrderMessages(order.id);
  const productList = editable
    ? await db
        .select({
          id: products.id,
          name: products.name,
          basePrice: products.basePrice,
          unit: products.unit,
        })
        .from(products)
        .where(eq(products.isHidden, false))
        .orderBy(asc(products.name))
    : [];
  const contact = parseContact(order.contactInfo);

  // Материалы со склада: список списаний видит любой, кто смотрит склад,
  // форму - кто его правит. Менеджерские заказы так делали давно, сайтовые
  // - нет, и себестоимость по факту у них собрать было нельзя
  const [canStockView, canStock] = await Promise.all([
    can("materials", "view"),
    can("materials", "edit"),
  ]);
  const [writeOffs, materialList] = canStockView
    ? await Promise.all([
        listWriteOffs(db, { source: "site", id: order.id }),
        canStock ? activeMaterialOptions(db) : Promise.resolve([]),
      ])
    : [[], []];

  // Оплата - из бухгалтерской карточки: платежи вносит бухгалтерия, а
  // оплаченный счёт Точки попадает туда сам при сверке
  const canFinance = await can("finance", "view");
  const [card] = canFinance
    ? await db
        .select({
          id: ordersAccounting.id,
          status: ordersAccounting.status,
          income: ordersAccounting.income,
        })
        .from(ordersAccounting)
        .where(eq(ordersAccounting.orderId, order.id))
        .orderBy(asc(ordersAccounting.id))
        .limit(1)
    : [];
  const [paidRow] = card
    ? await db
        .select({ paid: sql<string>`coalesce(sum(${orderPayments.amount}), 0)` })
        .from(orderPayments)
        .where(eq(orderPayments.orderAccountingId, card.id))
    : [];
  const paidSum = Number(paidRow?.paid ?? 0);
  const pay = card ? paymentStateOf(card.status) : null;

  return (
    <AdminPage
      title={`Заказ № ${order.id}`}
      subtitle={order.createdAt ? dt.format(order.createdAt) : undefined}
      actions={
        <>
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <ArrowLeft className="size-4" aria-hidden />
            К списку
          </Link>
          {/* Печатные формы открываются в новой вкладке: из карточки
              заказа уходить незачем, а печать идёт диалогом браузера */}
          <Link
            href={`/print/invoice/site/${order.id}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Receipt className="size-4" aria-hidden />
            Счёт
          </Link>
          <Link
            href={`/print/upd/site/${order.id}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <FileSignature className="size-4" aria-hidden />
            УПД
          </Link>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        {/* ---------- Состав ---------- */}
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Состав заказа</h2>

          {items.length === 0 ? (
            <AdminEmpty
              title="Позиций нет"
              text="Заказ создан без позиций - вероятно, оформлен как заявка."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
              <table className="w-full min-w-[38rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>Позиция</Th>
                    <Th className="text-right">Кол-во</Th>
                    <Th className="text-right">Цена</Th>
                    <Th className="text-right">Сумма</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const name = it.productName ?? it.itemName ?? "Без названия";
                    const attrs = parseOrderAttributes(it.attributes);

                    return (
                      <Fragment key={it.id}>
                      <tr className="border-b border-ink/6">
                        <td className="px-4 py-3">
                          {it.productId ? (
                            <Link
                              href={`/catalog/${it.productId}`}
                              className="text-ink hover:text-brand"
                            >
                              {name}
                            </Link>
                          ) : (
                            <span className="text-ink">{name}</span>
                          )}
                          {it.isCustom && (
                            <span className="ml-2 rounded bg-navy/10 px-1.5 py-0.5 font-display text-[0.58rem] tracking-wider text-navy">
                              НЕСТАНДАРТ
                            </span>
                          )}
                          {attrs.length > 0 && (
                            <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink/50">
                              {attrs.map((a, i) => (
                                <li key={i}>{formatOrderAttribute(a)}</li>
                              ))}
                            </ul>
                          )}
                          {it.itemNote && (
                            <p className="mt-1 text-xs text-ink/50">
                              {it.itemNote}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                          {it.quantity} {it.unit ?? "шт."}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                          {it.unitPrice ? money.format(Number(it.unitPrice)) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                          {money.format(Number(it.price))}
                        </td>
                      </tr>

                      {/* Правка отдельной строкой во всю ширину: внутри
                          ячейки поля формы сжимались до нечитаемого */}
                      {editable && (
                        <tr className="border-b border-ink/6 last:border-0">
                          <td colSpan={4} className="px-4 pb-4 pt-0">
                            <details>
                              <summary className="cursor-pointer text-xs text-brand hover:text-brand-bright">
                                изменить позицию
                              </summary>
                              <div className="mt-2 flex flex-col gap-2">
                                <OrderItemForm
                                  orderId={order.id}
                                  value={{
                                    id: it.id,
                                    productId: it.productId,
                                    itemName: it.itemName,
                                    itemNote: it.itemNote,
                                    quantity: it.quantity,
                                    unitPrice: it.unitPrice,
                                  }}
                                  productList={productList}
                                />
                                <DeleteOrderItemButton orderId={order.id} itemId={it.id} />
                              </div>
                            </details>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  {contact?.urgentFee ? (
                    <tr className="border-t border-ink/10">
                      <td colSpan={3} className="px-4 py-2 text-right text-sm text-ink/55">
                        Надбавка за срочность
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-danger">
                        +{money.format(contact.urgentFee)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-t border-ink/12 bg-paper">
                    <td colSpan={3} className="px-4 py-3 text-right text-ink/60">
                      Итого по заказу
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-base tabular-nums text-ink">
                      {money.format(Number(order.total))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {editable && (
            <details className="mt-4 rounded-xl border border-ink/10 bg-bone px-5 py-4">
              <summary className="cursor-pointer font-display text-xs tracking-wider text-brand hover:text-brand-bright">
                + ДОБАВИТЬ ПОЗИЦИЮ
              </summary>
              <div className="mt-3">
                <OrderItemForm orderId={order.id} productList={productList} />
              </div>
            </details>
          )}

          {(order.shippingAddress || order.contactInfo) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {order.shippingAddress && (
                <Card icon={MapPin} title="Адрес доставки">
                  {order.shippingAddress}
                </Card>
              )}
              {contact && (
                <Card icon={Phone} title="Контакт для связи">
                  {contact.raw ?? (
                    <span className="flex flex-col gap-0.5">
                      {contact.name && <span>{contact.name}</span>}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="hover:text-brand"
                        >
                          {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="hover:text-brand"
                        >
                          {contact.email}
                        </a>
                      )}
                      {contact.comment && (
                        <span className="mt-1 text-ink/60">
                          {contact.comment}
                        </span>
                      )}
                    </span>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* ---------- Макеты клиента ---------- */}
          <div className="mt-8">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              МАКЕТЫ КЛИЕНТА
            </h2>
            <ProofReview files={proofs} canReview={editable} />
          </div>

          <OrderChat
            orderId={order.id}
            messages={messages}
            canReply={editable}
          />
        </section>

        {/* ---------- Управление ---------- */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              Статус
            </p>
            <p className="mt-2">
              <span
                className={cn(
                  "rounded px-2.5 py-1 font-display text-xs tracking-wider",
                  st.className,
                )}
              >
                {st.label}
              </span>
            </p>

            {editable ? (
              <StatusForm orderId={order.id} status={order.status} />
            ) : (
              <p className="mt-3 text-xs text-ink/45">
                У вашей роли нет права менять статус.
              </p>
            )}
          </div>

          {card && pay && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                Оплата
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-2.5 py-1 font-display text-xs tracking-wider",
                    pay.className,
                  )}
                >
                  {pay.label}
                </span>
                <span className="font-mono text-sm text-ink/60">
                  {paidSum.toLocaleString("ru-RU")} из{" "}
                  {Number(card.income).toLocaleString("ru-RU")} ₽
                </span>
              </p>
              {debtOf(Number(card.income), paidSum) > 0 && order.status !== "cancelled" && (
                <p className="mt-2 text-xs text-warn">
                  Остаток {debtOf(Number(card.income), paidSum).toLocaleString("ru-RU")} ₽
                </p>
              )}
              <Link
                href={`/admin/finance/${card.id}`}
                className="mt-2 inline-block text-xs text-brand hover:text-brand-bright"
              >
                Платежи и расходы заказа
              </Link>
            </div>
          )}

          {editable && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                Документы клиенту
              </p>
              <div className="mt-3">
                <DocumentsToggle
                  source="site"
                  orderId={order.id}
                  visible={order.documentsVisible}
                />
              </div>
            </div>
          )}

          {/* Отменённому и завершённому заказу срочность менять нельзя: у
              первого нет работы, у второго итог уже закрыт. Сервер отказывает так же */}
          {editable && order.status !== "cancelled" && order.status !== "completed" && (
            <form action={toggleUrgent}>
              <input type="hidden" name="orderId" value={order.id} />
              <input
                type="hidden"
                name="urgent"
                value={order.isUrgent ? "0" : "1"}
              />
              <button
                type="submit"
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors",
                  order.isUrgent
                    ? "border-danger bg-danger/10 text-danger hover:bg-danger/15"
                    : "border-ink/15 text-ink/70 hover:border-danger hover:text-danger",
                )}
              >
                <Flame className="size-4" aria-hidden />
                {order.isUrgent ? "Снять срочность" : "Отметить срочным"}
              </button>
            </form>
          )}

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              Клиент
            </p>
            <p className="mt-2 text-ink">{order.clientName ?? "-"}</p>
            {order.companyName && (
              <p className="text-sm text-ink/55">{order.companyName}</p>
            )}

            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {order.clientEmail && (
                <li>
                  <a
                    href={`mailto:${order.clientEmail}`}
                    className="flex items-center gap-2 text-ink/70 hover:text-brand"
                  >
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    {order.clientEmail}
                  </a>
                </li>
              )}
              {order.clientPhone && (
                <li>
                  <a
                    href={`tel:${order.clientPhone}`}
                    className="flex items-center gap-2 text-ink/70 hover:text-brand"
                  >
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    {order.clientPhone}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {canStockView && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                МАТЕРИАЛЫ СО СКЛАДА
              </h2>

              {writeOffs.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-b border-ink/10 pb-3 text-sm">
                  {writeOffs.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3">
                      <span className={cn("text-ink/75", w.returned && "text-ink/40 line-through")}>
                        {w.name}
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-ink/50">
                        {Number(w.quantity)} {w.unit}
                        {w.amount && ` · ${Number(w.amount).toLocaleString("ru-RU")} ₽`}
                        {w.returned ? (
                          <span className="font-sans text-ok">возвращено</span>
                        ) : (
                          canStock && (
                            <ReturnWriteOffButton
                              source="site"
                              orderId={order.id}
                              movementId={w.id}
                            />
                          )
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canStock && (
                <div className="mt-3">
                  <WriteOffForm source="site" orderId={order.id} materials={materialList} />
                </div>
              )}
            </div>
          )}

          {order.readyDate && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                Готовность
              </p>
              <p className="mt-2 font-mono text-ink">
                {dt.format(order.readyDate)}
              </p>
            </div>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-bone p-4">
      <p className="flex items-center gap-2 font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-ink/80">{children}</p>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-display text-[0.62rem] font-semibold tracking-[0.16em] text-ink/40",
        className,
      )}
    >
      {children}
    </th>
  );
}
