import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flame } from "lucide-react";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { statusOf } from "@/lib/order-status";
import { clientOrders } from "@/lib/client-orders-db";
import { externalPaymentStatus, externalProductionStatus } from "@/lib/external-orders";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Мои заказы",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function ClientOrdersPage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/orders");

  const list = await clientOrders(Number(user.id));

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Мои заказы"
        lead="Каждый заказ со своей стадией и перепиской. Статус меняется по мере работы - отслеживать звонками не нужно."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/orders", label: "Заказы" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          {list.length === 0 ? (
            <div className="rounded-card border border-ink/10 bg-bone/85 p-10 text-center">
              <p className="text-ink/60">
                Заказов пока нет. Загляните в каталог или опишите задачу - посчитаем
                и вернёмся со сроками.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/catalog" size="md">
                  В каталог
                </ButtonLink>
                <ButtonLink href="/contacts" size="md" variant="outline">
                  Описать задачу
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((order) => {
                // У сайтового заказа стадия одна, у менеджерского их две -
                // производство и оплата; клиенту важны обе
                const st =
                  order.kind === "site"
                    ? statusOf(order.status)
                    : externalProductionStatus(order.status);
                return (
                  <li key={`${order.kind}-${order.id}`}>
                    <Link
                      href={order.href}
                      className="group flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-ink/10 bg-bone/85 px-6 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
                    >
                      <span className="font-mono text-sm text-ink/45">
                        № {order.id}
                      </span>

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

                      {order.paymentStatus && (
                        <span
                          className={cn(
                            "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                            externalPaymentStatus(order.paymentStatus).className,
                          )}
                        >
                          {externalPaymentStatus(order.paymentStatus).label}
                        </span>
                      )}

                      <span className="w-full text-sm text-ink/60 sm:w-auto sm:flex-1">
                        {order.preview || "Состав уточняется"}
                      </span>

                      <span className="text-sm text-ink/50">
                        {order.createdAt ? date.format(order.createdAt) : "-"}
                      </span>

                      <span className="font-mono text-lg text-ink">
                        {money.format(Number(order.total))}
                      </span>

                      <ChevronRight
                        className="size-4 text-ink/30 transition-colors group-hover:text-brand"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
