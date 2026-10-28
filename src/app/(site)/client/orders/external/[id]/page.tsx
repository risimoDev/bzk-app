import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { clientExternalOrder } from "@/lib/client-orders-db";
import {
  externalPaymentStatus,
  externalProductionStatus,
} from "@/lib/external-orders";
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
const date = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Заказ, оформленный менеджером, - глазами клиента.
 *
 * Переписки и файлов у него нет: он заводился по телефону или в
 * переговорной, а не через сайт. Показываем состав, сроки и деньги -
 * ровно то, о чём клиент звонит спросить.
 */
export default async function ClientExternalOrderPage({
  params,
}: PageProps<"/client/orders/external/[id]">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/orders");

  const { id } = await params;
  const orderId = parseId(id);
  if (orderId === null) notFound();

  const order = await clientExternalOrder(Number(user.id), orderId);
  if (!order) notFound();

  const prod = externalProductionStatus(order.status);
  const pay = externalPaymentStatus(order.paymentStatus);
  const itemsSum = order.items.reduce((s, i) => s + Number(i.price), 0);

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title={`Заказ № ${order.id}`}
        lead={
          order.createdAt
            ? `Оформлен ${date.format(order.createdAt)} менеджером.`
            : "Оформлен менеджером."
        }
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/orders", label: "Заказы" },
          { href: `/client/orders/external/${order.id}`, label: `№ ${order.id}` },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                prod.className,
              )}
            >
              {prod.label}
            </span>
            <span
              className={cn(
                "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                pay.className,
              )}
            >
              {pay.label}
            </span>
            {order.readyDate && (
              <span className="text-sm text-ink/60">
                готовность {date.format(order.readyDate)}
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-start">
            <div className="overflow-hidden rounded-card border border-ink/10 bg-bone/85">
              <header className="border-b border-ink/10 px-6 py-4">
                <h2 className="font-display text-lg text-ink">Состав</h2>
              </header>

              {order.items.length === 0 ? (
                <p className="px-6 py-6 text-sm text-ink/55">
                  {order.description
                    ? "Позиции не расписаны - заказ описан текстом ниже."
                    : "Состав уточняется у менеджера."}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {order.items.map((i) => (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink/6 px-6 py-4 last:border-0"
                    >
                      <span className="text-ink">
                        {i.name}
                        {i.description && (
                          <span className="block text-sm text-ink/50">
                            {i.description}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-sm text-ink/55">
                        {i.quantity} {i.unit ?? "шт."}
                      </span>
                      <span className="font-mono tabular-nums text-ink">
                        {money.format(Number(i.price))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <footer className="flex flex-col items-end gap-1 border-t border-ink/10 px-6 py-4">
                {order.items.length > 0 && (
                  <span className="text-sm text-ink/55">
                    Сумма позиций: {money.format(itemsSum)}
                  </span>
                )}
                <span className="font-mono text-xl text-ink">
                  {money.format(Number(order.totalPrice))}
                </span>
              </footer>
            </div>

            <aside className="flex flex-col gap-5">
              {order.description && (
                <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                  <h2 className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
                    ОПИСАНИЕ
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink/75">
                    {order.description}
                  </p>
                </div>
              )}

              {order.address && (
                <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                  <h2 className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
                    АДРЕС
                  </h2>
                  <p className="mt-2 text-sm text-ink/75">{order.address}</p>
                </div>
              )}

              {/* Как и у сайтовых заказов: пока менеджер не открыл
                  документы, счёт - черновик */}
              {order.documentsVisible && (
                <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                  <h2 className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
                    ДОКУМЕНТЫ
                  </h2>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    <li>
                      <a
                        href={`/print/invoice/external/${order.id}`}
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
                        href={`/print/upd/external/${order.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-ink hover:text-brand"
                      >
                        <FileText className="size-3.5 shrink-0" aria-hidden />
                        Универсальный передаточный документ
                      </a>
                    </li>
                  </ul>
                </div>
              )}

              <div className="rounded-card border border-ink/10 bg-bone/85 p-6">
                <p className="text-sm text-ink/60">
                  Что-то поменялось по заказу - напишите в поддержку или позвоните
                  менеджеру.
                </p>
                <Link
                  href="/client/support"
                  className="mt-3 inline-block text-sm text-brand hover:text-brand-bright"
                >
                  Написать в поддержку
                </Link>
              </div>

              <Link
                href="/client/orders"
                className="inline-flex items-center gap-2 text-sm text-ink/60 hover:text-brand"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Ко всем заказам
              </Link>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
