import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, count, and, inArray } from "drizzle-orm";
import { PackageOpen, Wand2, LayoutGrid, FolderUp, LifeBuoy, Boxes } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { clientUploads, supportTickets, miniWarehouseItems } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { statusOf } from "@/lib/order-status";
import { clientOrders } from "@/lib/client-orders-db";
import { externalProductionStatus } from "@/lib/external-orders";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Личный кабинет",
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

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/dashboard");

  const userId = Number(user.id);

  // Заказы берём обоих видов: у клиента, которого менеджер вёл по
  // телефону, сайтовых заказов может не быть вовсе
  const [all, [filesPending], [ticketsOpen], [warehouse]] = await Promise.all([
    clientOrders(userId),
    db
      .select({ n: count() })
      .from(clientUploads)
      .where(
        and(
          eq(clientUploads.userId, userId),
          inArray(clientUploads.status, ["pending", "revision"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.userId, userId),
          inArray(supportTickets.status, ["open", "in_progress", "waiting_client"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(miniWarehouseItems)
      .where(eq(miniWarehouseItems.userId, userId)),
  ]);

  // Список ниже - только последние пять, а в сводке важно общее число.
  // Заказ считается идущим, пока не завершён и не отменён
  const list = all.slice(0, 5);
  const totals = {
    total: all.length,
    spent: all.reduce((s, o) => s + Number(o.total), 0),
  };
  const active = all.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  ).length;
  const waitingFiles = Number(filesPending?.n ?? 0);
  const openTickets = Number(ticketsOpen?.n ?? 0);
  const stored = Number(warehouse?.n ?? 0);

  return (
    <>
      <PageHero
        eyebrow="Личный кабинет"
        title={`Здравствуйте, ${user.name}`}
        lead="Заказы, макеты и переписка в одном месте. Статусы обновляются сами - звонить, чтобы узнать, на какой стадии заказ, не нужно."
        breadcrumb={[{ href: "/client/dashboard", label: "Кабинет" }]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          {/* ---------- Сводка ---------- */}
          <dl className="grid gap-4 sm:grid-cols-3">
            <Stat label="Всего заказов" value={String(totals.total)} />
            <Stat label="В работе" value={String(active)} />
            <Stat label="На сумму" value={money.format(totals.spent)} />
          </dl>

          {/* ---------- Быстрые действия ---------- */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Action
              href="/catalog"
              icon={LayoutGrid}
              title="Каталог"
              text="Посмотреть, что можно заказать"
            />
            <Action
              href="/contacts"
              icon={PackageOpen}
              title="Новый заказ"
              text="Описать задачу и получить расчёт"
            />
            <Action
              href="/client/uploads"
              icon={FolderUp}
              title="Файлы"
              text={
                waitingFiles > 0
                  ? `${waitingFiles} на проверке у менеджера`
                  : "Загрузить макет к заказу"
              }
              badge={waitingFiles > 0 ? waitingFiles : undefined}
            />
            <Action
              href="/client/support"
              icon={LifeBuoy}
              title="Поддержка"
              text={
                openTickets > 0
                  ? `${openTickets} открытых обращений`
                  : "Задать вопрос по заказу"
              }
              badge={openTickets > 0 ? openTickets : undefined}
            />
            {user.miniWarehouseEnabled && (
              <Action
                href="/client/warehouse"
                icon={Boxes}
                title="Мой склад"
                text={stored > 0 ? `${stored} позиций на хранении` : "Список пуст"}
              />
            )}
            {user.canUseEditor && (
              <Action
                href="/client/editor"
                icon={Wand2}
                title="Редактор открыток"
                text="Собрать поздравление с днём рождения"
              />
            )}
          </div>

          {/* ---------- Заказы ---------- */}
          <div className="mt-14 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">
              Последние заказы
            </h2>
            {Number(totals?.total ?? 0) > list.length && (
              <Link
                href="/client/orders"
                className="text-sm text-brand hover:text-brand-bright"
              >
                Все заказы - {totals?.total}
              </Link>
            )}
          </div>

          {list.length === 0 ? (
            <div className="mt-6 rounded-card border border-ink/10 bg-bone/85 p-10 text-center">
              <p className="text-ink/60">
                Заказов пока нет. Загляните в каталог или опишите задачу - мы
                посчитаем и вернёмся со сроками.
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
            <ul className="mt-6 flex flex-col gap-3">
              {list.map((order) => {
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
                        <span className="rounded-pill bg-danger/12 px-3 py-1 font-display text-[0.68rem] tracking-[0.12em] text-danger">
                          Срочный
                        </span>
                      )}

                      <span className="text-sm text-ink/55">
                        {order.createdAt ? date.format(order.createdAt) : "-"}
                      </span>

                      <span className="ml-auto font-mono text-lg text-ink">
                        {money.format(Number(order.total))}
                      </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-ink px-6 py-5 text-bone grain">
      <dt className="relative font-display text-[0.68rem] tracking-[0.18em] text-ice/50">
        {label}
      </dt>
      <dd className="relative mt-2 font-mono text-3xl text-brand-bright">{value}</dd>
    </div>
  );
}

function Action({
  href,
  icon: Icon,
  title,
  text,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  text: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-card border border-ink/10 bg-bone/85 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"
    >
      <span className="relative grid size-11 shrink-0 place-items-center rounded-pill bg-brand text-bone transition-colors group-hover:bg-brand-bright">
        <Icon className="size-5" />
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-pill bg-danger font-mono text-[0.6rem] text-bone">
            {badge}
          </span>
        )}
      </span>
      <span>
        <span className="block font-display text-lg text-ink group-hover:text-brand">
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-ink/55">{text}</span>
      </span>
    </Link>
  );
}
