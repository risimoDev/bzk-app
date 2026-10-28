import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  ArrowLeft,
  ExternalLink,
  Factory,
  Mail,
  MapPin,
  Phone,
  Printer,
  Truck,
} from "lucide-react";
import { db } from "@/db";
import {
  clients,
  externalOrders,
  externalOrderItems,
  externalOrderReadyHistory,
  materials,
  materialsMovements,
  materialsStock,
  products,
  suppliers,
  users,
  qcDefects,
  productionOrders,
  ordersAccounting,
  orderPayments,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  externalPaymentStatus,
  externalProductionStatus,
  READY_CHANGE_TYPE,
  type ReadyChangeType,
} from "@/lib/external-orders";
import {
  CounterpartyPicker,
  DeleteOrderButton,
  OrderHeaderForm,
  ProductionControls,
  ReadyDateForm,
} from "./OrderControls";
import { DeleteItemButton, ItemForm } from "./ItemForm";
import { startProduction } from "@/app/admin/production/actions";
import { WriteOffForm } from "./WriteOffForm";
import { PaymentForm } from "@/app/admin/finance/FinanceForms";
import { debtOf, externalOrderTotal } from "@/lib/order-money";
import { DocumentsToggle } from "@/app/admin/orders/DocumentsToggle";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Внешний заказ · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Дата для input type="date" - местный календарный день, без сдвига. */
function dateInputValue(d: Date | null) {
  if (!d) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export default async function AdminExternalOrder({
  params,
}: PageProps<"/admin/external-orders/[id]">) {
  if (!(await can("orders", "view"))) {
    return (
      <AdminPage title="Внешний заказ">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть заказы." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const orderId = parseId(id);
  if (orderId === null) notFound();

  const [order] = await db
    .select()
    .from(externalOrders)
    .where(eq(externalOrders.id, orderId))
    .limit(1);

  if (!order) notFound();

  const canEdit = await can("orders", "edit");
  const canDelete = await can("orders", "delete");
  const canStartProduction = await can("kanban", "edit");

  const [items, history, production, counterparty, counterpartyList, productList, supplierList] =
    await Promise.all([
      db
        .select({
          id: externalOrderItems.id,
          productId: externalOrderItems.productId,
          itemName: externalOrderItems.itemName,
          itemDescription: externalOrderItems.itemDescription,
          quantity: externalOrderItems.quantity,
          price: externalOrderItems.price,
          expense: externalOrderItems.expenseAmount,
          isOutsourced: externalOrderItems.isOutsourced,
          supplierId: externalOrderItems.supplierId,
          supplierName: suppliers.name,
          productName: products.name,
          unit: products.unit,
        })
        .from(externalOrderItems)
        .leftJoin(products, eq(products.id, externalOrderItems.productId))
        .leftJoin(suppliers, eq(suppliers.id, externalOrderItems.supplierId))
        .where(eq(externalOrderItems.externalOrderId, orderId))
        .orderBy(asc(externalOrderItems.id)),
      db
        .select({
          id: externalOrderReadyHistory.id,
          previousDate: externalOrderReadyHistory.previousDate,
          newDate: externalOrderReadyHistory.newDate,
          changeType: externalOrderReadyHistory.changeType,
          reason: externalOrderReadyHistory.reason,
          createdAt: externalOrderReadyHistory.createdAt,
          author: users.name,
        })
        .from(externalOrderReadyHistory)
        .leftJoin(users, eq(users.id, externalOrderReadyHistory.changedBy))
        .where(eq(externalOrderReadyHistory.externalOrderId, orderId))
        .orderBy(desc(externalOrderReadyHistory.id)),
      db
        .select({ id: productionOrders.id })
        .from(productionOrders)
        .where(eq(productionOrders.externalOrderId, orderId))
        .limit(1),
      order.clientId
        ? db
            .select({
              id: clients.id,
              name: clients.name,
              companyName: clients.companyName,
              userId: clients.userId,
            })
            .from(clients)
            .where(eq(clients.id, order.clientId))
            .limit(1)
        : Promise.resolve([]),
      canEdit
        ? db
            .select({ id: clients.id, name: clients.name, companyName: clients.companyName })
            .from(clients)
            .where(eq(clients.isArchived, false))
            .orderBy(asc(clients.name))
        : Promise.resolve([]),
      canEdit
        ? db
            .select({
              id: products.id,
              name: products.name,
              basePrice: products.basePrice,
              unit: products.unit,
            })
            .from(products)
            .where(eq(products.isHidden, false))
            .orderBy(asc(products.name))
        : Promise.resolve([]),
      canEdit
        ? db
            .select({ id: suppliers.id, name: suppliers.name })
            .from(suppliers)
            .where(eq(suppliers.isActive, true))
            .orderBy(asc(suppliers.name))
        : Promise.resolve([]),
    ]);

  const canStock = await can("materials", "edit");
  const [canFinance, canPay] = await Promise.all([
    can("finance", "view"),
    can("finance", "create"),
  ]);

  // Оплата - из бухгалтерской карточки: статус заказа лишь её копия, а
  // сумму платежей и остаток знает только карточка
  const [card] = await db
    .select({ id: ordersAccounting.id, income: ordersAccounting.income })
    .from(ordersAccounting)
    .where(eq(ordersAccounting.externalOrderId, orderId))
    .orderBy(asc(ordersAccounting.id))
    .limit(1);
  const [paidRow] = card
    ? await db
        .select({ paid: sql<string>`coalesce(sum(${orderPayments.amount}), 0)` })
        .from(orderPayments)
        .where(eq(orderPayments.orderAccountingId, card.id))
    : [{ paid: "0" }];
  const paidSum = Number(paidRow?.paid ?? 0);

  const [materialList, writeOffs] = await Promise.all([
    canStock
      ? db
          .select({
            id: materials.id,
            name: materials.name,
            unit: materials.unit,
            quantity: materialsStock.quantity,
          })
          .from(materials)
          .leftJoin(materialsStock, eq(materialsStock.materialId, materials.id))
          .orderBy(asc(materials.name))
      : Promise.resolve([]),
    // Списания по этому заказу: движение помечено ссылкой на него
    db
      .select({
        id: materialsMovements.id,
        quantity: materialsMovements.quantity,
        createdAt: materialsMovements.createdAt,
        name: materials.name,
        unit: materials.unit,
        cost: materials.costPerUnit,
      })
      .from(materialsMovements)
      .innerJoin(materials, eq(materials.id, materialsMovements.materialId))
      .where(
        and(
          eq(materialsMovements.referenceType, "order"),
          eq(materialsMovements.referenceId, orderId),
          eq(materialsMovements.type, "out"),
        ),
      )
      .orderBy(desc(materialsMovements.createdAt)),
  ]);

  const defects = production[0]
    ? await db
        .select({ id: qcDefects.id, title: qcDefects.title, status: qcDefects.status })
        .from(qcDefects)
        .where(eq(qcDefects.productionOrderId, production[0].id))
    : [];

  const pay = externalPaymentStatus(order.status);
  const prod = externalProductionStatus(order.productionStatus);

  // В external_order_items столбец price - стоимость всей строки, а не
  // цена за штуку: отдельного unit_price там нет, и старый код так же
  // делил её на количество, когда показывал цену единицы
  const itemsSum = items.reduce((s, i) => s + Number(i.price), 0);
  const expenses = items.reduce((s, i) => s + Number(i.expense), 0);
  const total = Number(order.totalPrice);
  const outsourcedSum = items
    .filter((i) => i.isOutsourced)
    .reduce((s, i) => s + Number(i.price), 0);

  const adjustment = Number(order.adjustment);
  const debt = debtOf(total, paidSum);

  // Итог пересчитывается из позиций и корректировки. Если он всё же
  // разошёлся (правили базу в обход приложения), это надо увидеть
  const mismatch = Math.abs(externalOrderTotal(itemsSum, adjustment) - total) > 0.01;

  return (
    <AdminPage
      title={`Внешний заказ № ${order.id}`}
      subtitle={
        order.createdAt ? `создан ${dateFmt.format(order.createdAt)}` : undefined
      }
      actions={
        <>
          <Link
            href="/admin/external-orders"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            К СПИСКУ
          </Link>
          {production[0] && (
            <Link
              href={`/admin/quality/inspect/${production[0].id}`}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
            >
              <Printer className="size-3.5" aria-hidden />
              ПРОВЕРКА КАЧЕСТВА
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {/* -------------------------------------------- состав */}
          <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
            <header className="border-b border-ink/10 px-5 py-3">
              <h2 className="font-display text-base text-ink">Состав заказа</h2>
            </header>

            {items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink/50">
                Позиции не заведены - заказ описан текстом.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                <table className="min-w-[40rem] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left font-display text-[0.6rem] tracking-[0.14em] text-ink/40">
                      <th className="px-5 py-2.5">ПОЗИЦИЯ</th>
                      <th className="px-4 py-2.5 text-right">КОЛ-ВО</th>
                      <th className="px-4 py-2.5 text-right">ЦЕНА</th>
                      <th className="px-4 py-2.5 text-right">СУММА</th>
                      <th className="px-4 py-2.5 text-right">ЗАТРАТЫ</th>
                      <th className="px-5 py-2.5 text-right">МАРЖА</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const name = i.productName ?? i.itemName ?? "Без названия";
                      const sum = Number(i.price);
                      const expense = Number(i.expense);
                      const unitPrice = i.quantity > 0 ? sum / i.quantity : 0;
                      return (
                        <Fragment key={i.id}>
                        <tr className="border-b border-ink/6 align-top">
                          <td className="px-5 py-3">
                            {i.productId ? (
                              <Link
                                href={`/admin/products/${i.productId}`}
                                className="text-ink hover:text-brand"
                              >
                                {name}
                              </Link>
                            ) : (
                              <span className="text-ink">{name}</span>
                            )}
                            {i.itemDescription && (
                              <span className="block text-xs text-ink/50">
                                {i.itemDescription}
                              </span>
                            )}
                            {i.isOutsourced && (
                              <span className="mt-1 inline-flex items-center gap-1.5 rounded bg-navy/10 px-2 py-0.5 text-[0.68rem] text-navy">
                                <Truck className="size-3" aria-hidden />
                                перезаказ · {i.supplierName ?? "подрядчик не указан"}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-ink/55">
                            {i.quantity} {i.unit ?? "шт."}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/60">
                            {money.format(unitPrice)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink">
                            {money.format(sum)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-ink/45">
                            {expense > 0 ? money.format(expense) : "-"}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-5 py-3 text-right font-mono tabular-nums",
                              sum - expense < 0 ? "text-danger" : "text-ok",
                            )}
                          >
                            {money.format(sum - expense)}
                          </td>
                        </tr>
  
                        {/* Форма правки - отдельной строкой во всю ширину:
                            внутри ячейки её поля сжимались до нечитаемого */}
                        {canEdit && (
                          <tr className="border-b border-ink/6 last:border-0">
                            <td colSpan={6} className="px-5 pb-4 pt-0">
                              <details>
                                <summary className="cursor-pointer text-xs text-brand hover:text-brand-bright">
                                  изменить позицию
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                  <ItemForm
                                    orderId={order.id}
                                    value={{
                                      id: i.id,
                                      productId: i.productId,
                                      itemName: i.itemName,
                                      itemDescription: i.itemDescription,
                                      quantity: i.quantity,
                                      price: i.price,
                                      expenseAmount: i.expense,
                                      isOutsourced: i.isOutsourced,
                                      supplierId: i.supplierId,
                                    }}
                                    productList={productList}
                                    suppliers={supplierList}
                                  />
                                  <DeleteItemButton orderId={order.id} itemId={i.id} />
                                </div>
                              </details>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="flex flex-col items-end gap-1 border-t border-ink/10 px-5 py-3 text-sm">
              {items.length > 0 && (
                <>
                  <Row label="Сумма позиций" value={money.format(itemsSum)} />
                  {expenses > 0 && (
                    <Row label="Затраты по позициям" value={money.format(expenses)} />
                  )}
                  {outsourcedSum > 0 && (
                    <Row label="Ушло подрядчикам" value={money.format(outsourcedSum)} />
                  )}
                </>
              )}
              {adjustment !== 0 && (
                <Row
                  label={
                    (adjustment < 0 ? "Скидка" : "Наценка") +
                    (order.adjustmentNote ? ` (${order.adjustmentNote})` : "")
                  }
                  value={(adjustment < 0 ? "−" : "+") + money.format(Math.abs(adjustment))}
                />
              )}
              <Row label="Итог заказа" value={money.format(total)} strong />
              <Row label="Маржа" value={money.format(total - expenses)} />

              {mismatch && (
                <p className="mt-1 max-w-md text-right text-xs text-warn">
                  Итог не сходится с суммой позиций и корректировкой - сохраните данные
                  заказа, чтобы пересчитать.
                </p>
              )}
            </footer>

            {canEdit && (
              <div className="border-t border-ink/10 px-5 py-4">
                <details>
                  <summary className="cursor-pointer font-display text-xs tracking-wider text-brand hover:text-brand-bright">
                    + ДОБАВИТЬ ПОЗИЦИЮ
                  </summary>
                  <div className="mt-3">
                    <ItemForm
                      orderId={order.id}
                      productList={productList}
                      suppliers={supplierList}
                    />
                  </div>
                </details>
              </div>
            )}
          </section>

          {/* ------------------------------------------ шапка заказа */}
          {canEdit ? (
            <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
              <h2 className="font-display text-base text-ink">Данные заказа</h2>
              <div className="mt-4">
                <OrderHeaderForm
                  order={{
                    id: order.id,
                    clientName: order.clientName,
                    phone: order.phone,
                    email: order.email,
                    address: order.address,
                    description: order.description,
                    itemsSum,
                    adjustment: order.adjustment,
                    adjustmentNote: order.adjustmentNote,
                  }}
                />
              </div>
            </section>
          ) : (
            order.description && (
              <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
                <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                  ОПИСАНИЕ
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm text-ink/75">
                  {order.description}
                </p>
              </section>
            )
          )}

          {/* ----------------------------------- срок готовности */}
          <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
            <h2 className="font-display text-base text-ink">Срок готовности</h2>
            <p className="mt-1 text-sm text-ink/55">
              {order.estimatedReadyDate
                ? dateFmt.format(order.estimatedReadyDate)
                : "Не назначен"}
            </p>

            {canEdit && (
              <div className="mt-4">
                <ReadyDateForm
                  orderId={order.id}
                  current={dateInputValue(order.estimatedReadyDate)}
                />
              </div>
            )}

            {history.length > 0 && (
              <ol className="mt-5 flex flex-col gap-2.5 border-t border-ink/10 pt-4 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-col border-l-2 border-ink/12 pl-3">
                    <span className="text-ink/75">
                      {READY_CHANGE_TYPE[h.changeType as ReadyChangeType] ?? h.changeType}
                      {" - "}
                      {h.previousDate && `${dtTime.format(h.previousDate).slice(0, 8)} → `}
                      {dtTime.format(h.newDate).slice(0, 8)}
                    </span>
                    <span className="font-mono text-xs text-ink/40">
                      {h.createdAt && dtTime.format(h.createdAt)}
                      {h.author && ` · ${h.author}`}
                    </span>
                    {h.reason && (
                      <span className="text-xs text-ink/55">{h.reason}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* ------------------------------------------ боковая колонка */}
        <aside className="flex flex-col gap-5">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              ЗАКАЗЧИК
            </h2>
            <p className="mt-2 text-ink">{order.clientName}</p>

            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {order.phone && (
                <li className="flex items-center gap-2 text-ink/70">
                  <Phone className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  <a href={`tel:${order.phone.replace(/\D/g, "")}`} className="hover:text-brand">
                    {order.phone}
                  </a>
                </li>
              )}
              {order.email && (
                <li className="flex items-center gap-2 text-ink/70">
                  <Mail className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  <a href={`mailto:${order.email}`} className="hover:text-brand">
                    {order.email}
                  </a>
                </li>
              )}
              {order.address && (
                <li className="flex items-start gap-2 text-ink/70">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink/35" aria-hidden />
                  {order.address}
                </li>
              )}
            </ul>

            <div className="mt-4 border-t border-ink/10 pt-4">
              {counterparty[0] ? (
                <p className="text-sm">
                  <Link
                    href={`/admin/counterparties/${counterparty[0].id}`}
                    className="inline-flex items-center gap-1.5 text-brand hover:text-brand-bright"
                  >
                    {counterparty[0].companyName || counterparty[0].name}
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                  <span className="mt-1 block text-xs text-ink/45">
                    {counterparty[0].userId
                      ? "заказ виден клиенту в кабинете"
                      : "аккаунта на сайте у контрагента нет"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink/45">
                  Контрагент не выбран - заказ нигде, кроме этого списка, не всплывёт.
                </p>
              )}

              {canEdit && (
                <div className="mt-3">
                  <CounterpartyPicker
                    orderId={order.id}
                    current={order.clientId}
                    options={counterpartyList}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              ОПЛАТА
            </h2>
            <span
              className={cn(
                "mt-2 inline-block rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                pay.className,
              )}
            >
              {pay.label}
            </span>
            {/* Статус оплаты считается из платежей - руками его не выбирают.
                Платёж вносит тот, у кого есть право на бухгалтерию: менеджер
                видит итог, но деньги в учёт не записывает */}
            <dl className="mt-3 flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink/55">Оплачено</dt>
                <dd className="font-mono tabular-nums text-ink">{money.format(paidSum)}</dd>
              </div>
              {debt > 0 && order.productionStatus !== "cancelled" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink/55">Остаток</dt>
                  <dd className="font-mono tabular-nums text-warn">{money.format(debt)}</dd>
                </div>
              )}
            </dl>
            {card && canPay ? (
              <div className="mt-3">
                <PaymentForm cardId={card.id} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink/45">
                Статус меняется сам, когда бухгалтерия вносит платёж.
              </p>
            )}
            {card && canFinance && (
              <Link
                href={`/admin/finance/${card.id}`}
                className="mt-2 inline-block text-xs text-brand hover:text-brand-bright"
              >
                Платежи и расходы заказа
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              ПРОИЗВОДСТВО
            </h2>
            <span
              className={cn(
                "mt-2 inline-block rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                prod.className,
              )}
            >
              {prod.label}
            </span>
            {canEdit && (
              <div className="mt-3">
                <ProductionControls
                  orderId={order.id}
                  status={order.productionStatus}
                />
              </div>
            )}

            {/* Цех у сайтовых и менеджерских заказов один: запущенный
                заказ дальше живёт стадиями, а не этим полем */}
            {production[0] ? (
              <Link
                href="/admin/production"
                className="mt-3 inline-block text-xs text-brand hover:text-brand-bright"
              >
                Заказ на доске производства
              </Link>
            ) : (
              canStartProduction && (
                <form action={startProduction} className="mt-3">
                  <input type="hidden" name="externalOrderId" value={order.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
                  >
                    <Factory className="size-3.5" aria-hidden />
                    ЗАПУСТИТЬ В ПРОИЗВОДСТВО
                  </button>
                </form>
              )
            )}
          </div>

          {defects.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn/8 p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-warn">
                ДЕФЕКТЫ
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink/75">
                {defects.map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
              <Link
                href="/admin/quality/defects"
                className="mt-2 inline-block text-xs text-brand hover:text-brand-bright"
              >
                Открыть список дефектов
              </Link>
            </div>
          )}

          {canEdit && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                ДОКУМЕНТЫ
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/print/invoice/external/${order.id}`}
                    className="rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand"
                  >
                    СЧЁТ
                  </Link>
                  <Link
                    href={`/print/upd/external/${order.id}`}
                    className="rounded-lg border border-ink/15 px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-ink/70 hover:border-brand/40 hover:text-brand"
                  >
                    УПД
                  </Link>
                </div>
                <DocumentsToggle
                  source="external"
                  orderId={order.id}
                  visible={order.documentsVisible}
                />
              </div>
            </div>
          )}

          {canStock && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                МАТЕРИАЛЫ СО СКЛАДА
              </h2>

              {writeOffs.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-b border-ink/10 pb-3 text-sm">
                  {writeOffs.map((w) => (
                    <li key={w.id} className="flex justify-between gap-3">
                      <span className="text-ink/75">{w.name}</span>
                      <span className="whitespace-nowrap font-mono text-xs text-ink/50">
                        {Number(w.quantity)} {w.unit}
                        {w.cost &&
                          ` · ${money.format(Number(w.quantity) * Number(w.cost))}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <WriteOffForm
                  externalOrderId={order.id}
                  materials={materialList}
                />
              </div>
            </div>
          )}

          {canDelete && (
            <div className="rounded-xl border border-ink/10 bg-bone p-5">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                УДАЛЕНИЕ
              </h2>
              <div className="mt-3">
                <DeleteOrderButton orderId={order.id} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex gap-6">
      <span className="text-ink/55">{label}</span>
      <span
        className={cn(
          "min-w-28 text-right font-mono tabular-nums",
          strong ? "text-base text-ink" : "text-ink/70",
        )}
      >
        {value}
      </span>
    </div>
  );
}
