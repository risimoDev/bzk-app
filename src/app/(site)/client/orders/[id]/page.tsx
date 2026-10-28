import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { Check, Circle, Flame, Paperclip, TriangleAlert, FileText } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { orders, orderItems, products, clientUploads, documents } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { statusOf } from "@/lib/order-status";
import { buildTimeline, type TimelineStep } from "@/lib/order-timeline";
import { parseContact } from "@/lib/order-contact";
import { uploadStatus, formatFileSize } from "@/lib/client-portal";
import { docStatus } from "@/lib/documents-meta";
import { OrderChat } from "@/components/client/OrderChat";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Заказ",
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
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export default async function ClientOrderPage({ params }: PageProps<"/client/orders/[id]">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/orders");

  const { id } = await params;
  const orderId = parseId(id);
  if (orderId === null) notFound();

  const userId = Number(user.id);

  // Заказ ищем сразу с привязкой к владельцу: так чужой номер в адресе
  // даёт «не найдено», а не чужие данные
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);

  if (!order) notFound();

  const [items, files, timeline, orderDocuments] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        itemName: orderItems.itemName,
        itemNote: orderItems.itemNote,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        price: orderItems.price,
        productName: products.name,
        productId: products.id,
        unit: products.unit,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.id)),
    db
      .select()
      .from(clientUploads)
      .where(and(eq(clientUploads.orderId, orderId), eq(clientUploads.userId, userId)))
      .orderBy(desc(clientUploads.createdAt)),
    buildTimeline(order),
    // Документы, заведённые менеджером на этот заказ. Черновики и
    // отменённые клиенту показывать незачем - это внутренняя кухня
    db
      .select({
        id: documents.id,
        number: documents.documentNumber,
        title: documents.title,
        docDate: documents.documentDate,
        status: documents.status,
      })
      .from(documents)
      .where(
        and(
          eq(documents.orderId, orderId),
          inArray(documents.status, ["approved", "signed", "archived"]),
        ),
      )
      .orderBy(desc(documents.createdAt)),
  ]);

  const st = statusOf(order.status);
  const contact = parseContact(order.contactInfo);
  const itemsSum = items.reduce((s, i) => s + Number(i.price), 0);
  const extra = +(Number(order.totalPrice) - itemsSum).toFixed(2);

  return (
    <>
      <PageHero
        eyebrow={`Заказ № ${order.id}`}
        title={order.createdAt ? `от ${dateFmt.format(order.createdAt)}` : "Карточка заказа"}
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/orders", label: "Заказы" },
          { href: `/client/orders/${order.id}`, label: `№ ${order.id}` },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
            <div className="flex flex-col gap-6">
              {/* ---------- Путь заказа ---------- */}
              <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl text-ink">Как идёт заказ</h2>
                  <span
                    className={cn(
                      "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                  {order.isUrgent && (
                    <span className="flex items-center gap-1 rounded-pill bg-danger/12 px-3 py-1 font-display text-[0.68rem] tracking-[0.12em] text-danger">
                      <Flame className="size-3" aria-hidden />
                      Срочный
                    </span>
                  )}
                </div>

                {timeline.halted && (
                  <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-warn/12 px-4 py-3 text-sm text-warn">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <b className="block">{timeline.halted.label}</b>
                      {timeline.halted.text}
                    </span>
                  </p>
                )}

                <ol className="mt-5 flex flex-col gap-0">
                  {timeline.steps.map((step, i) => (
                    <Step
                      key={step.key}
                      step={step}
                      last={i === timeline.steps.length - 1 && timeline.production.length === 0}
                    />
                  ))}
                </ol>

                {timeline.production.length > 0 && (
                  <>
                    <h3 className="mt-6 font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                      ЭТАПЫ ПРОИЗВОДСТВА
                    </h3>
                    <ol className="mt-3 flex flex-col gap-0">
                      {timeline.production.map((step, i) => (
                        <Step
                          key={step.key}
                          step={step}
                          last={i === timeline.production.length - 1}
                        />
                      ))}
                    </ol>
                  </>
                )}
              </div>

              {/* ---------- Состав ---------- */}
              <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
                <h2 className="font-display text-xl text-ink">Состав</h2>

                {items.length === 0 ? (
                  <p className="mt-4 text-sm text-ink/55">
                    Позиции ещё не заведены - менеджер составит их после согласования.
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col divide-y divide-ink/8">
                    {items.map((it) => {
                      const name = it.productName ?? it.itemName ?? "Без названия";
                      return (
                        <li
                          key={it.id}
                          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 first:pt-0"
                        >
                          <span className="flex-1 text-ink">
                            {it.productId ? (
                              <Link
                                href={`/catalog/${it.productId}`}
                                className="hover:text-brand"
                              >
                                {name}
                              </Link>
                            ) : (
                              name
                            )}
                            {it.itemNote && (
                              <span className="block text-sm text-ink/50">{it.itemNote}</span>
                            )}
                          </span>
                          <span className="font-mono text-sm text-ink/55">
                            {it.quantity} {it.unit ?? "шт."}
                          </span>
                          <span className="w-28 text-right font-mono tabular-nums text-ink">
                            {money.format(Number(it.price))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <dl className="mt-5 flex flex-col gap-1.5 border-t border-ink/10 pt-4 text-sm">
                  {items.length > 0 && Math.abs(extra) >= 0.01 && (
                    <>
                      <SumRow label="Позиции" value={money.format(itemsSum)} />
                      <SumRow
                        label={
                          contact?.urgentFee && Math.abs(extra - contact.urgentFee) < 0.01
                            ? "Надбавка за срочность"
                            : "Дополнительно"
                        }
                        value={money.format(extra)}
                      />
                    </>
                  )}
                  <SumRow
                    label="Итого"
                    value={money.format(Number(order.totalPrice))}
                    strong
                  />
                </dl>
              </div>

              {/* ---------- Переписка ---------- */}
              <OrderChat orderId={order.id} userId={userId} />
            </div>

            {/* ---------- Боковая колонка ---------- */}
            <aside className="flex flex-col gap-5">
              <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                  ДОСТАВКА
                </h2>
                <p className="mt-2.5 text-sm text-ink/70">{order.shippingAddress}</p>

                {order.readyDate && (
                  <p className="mt-3 text-sm">
                    <span className="text-ink/50">Готовность: </span>
                    <span className="text-ink">{dateFmt.format(order.readyDate)}</span>
                  </p>
                )}

                {contact?.comment && (
                  <>
                    <h3 className="mt-5 font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                      ВАШ КОММЕНТАРИЙ
                    </h3>
                    <p className="mt-2 text-sm text-ink/70">{contact.comment}</p>
                  </>
                )}
              </div>

              <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                    ФАЙЛЫ ЗАКАЗА
                  </h2>
                  <Link
                    href={`/client/uploads?order=${order.id}`}
                    className="text-sm text-brand hover:text-brand-bright"
                  >
                    Загрузить
                  </Link>
                </div>

                {files.length === 0 ? (
                  <p className="mt-2.5 text-sm text-ink/50">
                    К заказу пока ничего не приложено.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {files.map((f) => {
                      const fs = uploadStatus(f.status);
                      return (
                        <li key={f.id} className="text-sm">
                          <a
                            href={`/api/uploads/${f.id}`}
                            className="flex items-center gap-2 text-ink hover:text-brand"
                          >
                            <Paperclip className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{f.originalName}</span>
                          </a>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-ink/45">
                            <span
                              className={cn("rounded px-1.5 py-0.5", fs.className)}
                            >
                              {fs.label}
                            </span>
                            {formatFileSize(f.fileSize)}
                            {f.createdAt && shortDate.format(f.createdAt)}
                          </span>
                          {f.adminComment && (
                            <span className="mt-1 block rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
                              {f.adminComment}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Документы показываем, только когда менеджер их открыл:
                  до согласования состава и суммы счёт - черновик, и
                  платить по нему нельзя */}
              {(order.documentsVisible || orderDocuments.length > 0) && (
                <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                  <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                    ДОКУМЕНТЫ
                  </h2>

                  {order.documentsVisible ? (
                    <>
                      <p className="mt-2.5 text-sm text-ink/55">
                        Открываются в печатном виде - оттуда же их сохраняет в PDF
                        браузер.
                      </p>
                      <ul className="mt-3 flex flex-col gap-2 text-sm">
                        <li>
                          <a
                            href={`/print/invoice/site/${order.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-ink hover:text-brand"
                          >
                            <FileText className="size-3.5 shrink-0" aria-hidden />
                            Счёт на оплату
                          </a>
                        </li>
                        <li>
                          <a
                            href={`/print/upd/site/${order.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-ink hover:text-brand"
                          >
                            <FileText className="size-3.5 shrink-0" aria-hidden />
                            Универсальный передаточный документ
                          </a>
                        </li>
                      </ul>
                    </>
                  ) : (
                    <p className="mt-2.5 text-sm text-ink/55">
                      Счёт и УПД появятся здесь, когда менеджер согласует состав и
                      сумму.
                    </p>
                  )}

                  {orderDocuments.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3 text-sm">
                      {orderDocuments.map((d) => (
                        <li key={d.id} className="text-ink/70">
                          <span className="flex items-center gap-2">
                            <FileText className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                            {d.title}
                          </span>
                          <span className="ml-5.5 block text-xs text-ink/45">
                            {d.number ?? `№ ${d.id}`}
                            {d.docDate && ` · ${d.docDate.split("-").reverse().join(".")}`}
                            {" · "}
                            {docStatus(d.status).label.toLowerCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/40">
                  ЧТО-ТО НЕ ТАК?
                </h2>
                <p className="mt-2.5 text-sm text-ink/60">
                  Опишите вопрос - ответим и заведём обращение, чтобы ничего не потерялось.
                </p>
                <Link
                  href={`/client/support?order=${order.id}`}
                  className="mt-3 inline-flex items-center gap-2 text-sm text-brand hover:text-brand-bright"
                >
                  <FileText className="size-4" aria-hidden />
                  Написать в поддержку
                </Link>
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}

function Step({ step, last }: { step: TimelineStep; last: boolean }) {
  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-pill border-2",
            step.done
              ? "border-brand bg-brand text-bone"
              : step.current
                ? "border-brand bg-bone text-brand"
                : "border-ink/15 bg-bone text-ink/25",
          )}
        >
          {step.done ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Circle className={cn("size-2", step.current && "fill-current")} aria-hidden />
          )}
        </span>
        {!last && (
          <span
            className={cn("w-0.5 flex-1", step.done ? "bg-brand/40" : "bg-ink/10")}
            aria-hidden
          />
        )}
      </div>

      <div className={cn("pb-5", last && "pb-0")}>
        <p
          className={cn(
            "text-sm",
            step.done || step.current ? "text-ink" : "text-ink/40",
          )}
        >
          {step.label}
        </p>
        {step.date && (
          <p className="font-mono text-xs text-ink/40">{shortDate.format(step.date)}</p>
        )}
      </div>
    </li>
  );
}

function SumRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink/55">{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          strong ? "text-lg text-ink" : "text-ink/70",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
