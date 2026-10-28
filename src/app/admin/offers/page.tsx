import type { Metadata } from "next";
import { desc, inArray, asc, count } from "drizzle-orm";
import Link from "next/link";
import { CalendarClock, Plus, Printer } from "lucide-react";
import { db } from "@/db";
import { commercialOffers, commercialOfferItems } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import { parseLocalDate, localDate } from "@/lib/dates";
import { OfferStatusForm, OfferToOrderButton } from "./OfferControls";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Коммерческие предложения · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export const OFFER_STATUS = {
  draft: { label: "Черновик", className: "bg-ink/10 text-ink/60" },
  sent: { label: "Отправлено", className: "bg-navy/12 text-navy" },
  accepted: { label: "Принято", className: "bg-ok/15 text-ok" },
  rejected: { label: "Отклонено", className: "bg-danger/12 text-danger" },
  expired: { label: "Истекло", className: "bg-warn/15 text-warn" },
} as const;

const PER_PAGE = 30;

export default async function AdminOffers({ searchParams }: PageProps<"/admin/offers">) {
  if (!(await can("documents", "view"))) {
    return (
      <AdminPage title="Коммерческие предложения">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть КП." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const page = pageFrom(sp.page);

  const offers = await db
    .select()
    .from(commercialOffers)
    .orderBy(desc(commercialOffers.createdAt), desc(commercialOffers.id))
    .limit(PER_PAGE)
    .offset(offsetOf(page, PER_PAGE));

  const [{ n: total }] = await db.select({ n: count() }).from(commercialOffers);

  const items = offers.length
    ? await db
        .select()
        .from(commercialOfferItems)
        .where(
          inArray(
            commercialOfferItems.offerId,
            offers.map((o) => o.id),
          ),
        )
        .orderBy(asc(commercialOfferItems.sortOrder), asc(commercialOfferItems.id))
    : [];

  const today = localDate();

  const canEdit = await can("documents", "edit");
  const canCreate = await can("documents", "create");
  const canOrder = await can("orders", "create");

  return (
    <AdminPage
      title="Коммерческие предложения"
      subtitle={`Всего: ${total}`}
      actions={
        canCreate && (
          <Link
            href="/admin/offers/new"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
          >
            <Plus className="size-3.5" aria-hidden />
            НОВОЕ КП
          </Link>
        )
      }
    >
      {offers.length === 0 ? (
        <AdminEmpty title="Предложений нет" />
      ) : (
        <div className="flex flex-col gap-4">
          {offers.map((o) => {
            const own = items.filter((i) => i.offerId === o.id);

            // Итог считаем из позиций: в базе total_amount у всех КП
            // остался нулевым - старый код его не пересчитывал
            const subtotal = own.reduce((s, i) => s + Number(i.total), 0);
            const discount = Number(o.discountPercent ?? 0);
            const total = +(subtotal * (1 - discount / 100)).toFixed(2);
            const stored = Number(o.totalAmount ?? 0);
            const mismatch = own.length > 0 && Math.abs(stored - total) > 0.01;

            const st =
              OFFER_STATUS[(o.status ?? "draft") as keyof typeof OFFER_STATUS] ??
              OFFER_STATUS.draft;

            // Срок действия - календарная дата, сравниваем строками:
            // так не мешает часовой пояс
            const outdated =
              o.validUntil !== null &&
              o.validUntil < today &&
              o.status !== "accepted";

            return (
              <section
                key={o.id}
                className="overflow-hidden rounded-xl border border-ink/10 bg-bone"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm text-ink">{o.number}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                    {outdated && (
                      <span className="flex items-center gap-1 rounded bg-warn/15 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-warn">
                        <CalendarClock className="size-2.5" aria-hidden />
                        СРОК ВЫШЕЛ
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink/55">
                    <span className="text-ink/75">
                      {o.clientName}
                      {o.clientCompany && ` · ${o.clientCompany}`}
                    </span>
                    {o.validUntil && (
                      <span className="font-mono">
                        до {dt.format(parseLocalDate(o.validUntil)!)}
                      </span>
                    )}
                    <span className="font-mono text-sm text-ink">
                      {money.format(total)}
                    </span>
                    <Link
                      href={`/print/offer/${o.id}`}
                      className="flex items-center gap-1 text-xs text-brand hover:text-brand-bright"
                    >
                      <Printer className="size-3" aria-hidden />
                      печать
                    </Link>
                  </div>
                </header>

                {own.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-ink/45">
                    Позиций не заведено.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      {/* Узкий экран: таблица прокручивается сама, а не распирает страницу */}
                      <table className="min-w-[36rem] w-full border-collapse text-sm">
                        <tbody>
                          {own.map((i) => (
                            <tr
                              key={i.id}
                              className="border-b border-ink/6 last:border-0"
                            >
                              <td className="px-5 py-2.5">
                                <span className="text-ink">{i.name}</span>
                                {i.description && (
                                  <span className="block text-xs text-ink/50">
                                    {i.description}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink/55">
                                {i.quantity} {i.unit ?? "шт."}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-ink/60">
                                {money.format(Number(i.price))}
                              </td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono tabular-nums text-ink">
                                {money.format(Number(i.total))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col items-end gap-1 border-t border-ink/10 px-5 py-3 text-sm">
                      {discount > 0 && (
                        <>
                          <Row label="Сумма позиций" value={money.format(subtotal)} />
                          <Row
                            label={`Скидка ${discount}%`}
                            value={`− ${money.format(subtotal - total)}`}
                            tone="danger"
                          />
                        </>
                      )}
                      <Row label="Итого" value={money.format(total)} strong />

                      {mismatch && (
                        <p className="mt-1 text-xs text-warn">
                          В базе у этого КП записан итог {money.format(stored)} -
                          старый сайт его не пересчитывал.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {(canEdit || canOrder) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-5 py-3">
                    {canEdit ? (
                      <OfferStatusForm offerId={o.id} status={o.status} />
                    ) : (
                      <span />
                    )}
                    {/* Заказ из КП уже заведён - вместо кнопки ссылка на него:
                        вторая кнопка плодила бы дубли. Из отклонённого и
                        просроченного КП заказ не заводится вовсе */}
                    {o.externalOrderId !== null ? (
                      <Link
                        href={`/admin/external-orders/${o.externalOrderId}`}
                        className="text-sm text-brand hover:text-brand-bright"
                      >
                        Заказ № {o.externalOrderId} →
                      </Link>
                    ) : o.status === "accepted" ? (
                      // Принято, но связи нет: заказ, скорее всего, завели
                      // руками или до появления связи. Вторую кнопку не даём
                      <span className="text-xs text-ink/45">
                        Принято: заказ создан раньше - найдите его в списке заказов
                      </span>
                    ) : (
                      canOrder &&
                      own.length > 0 &&
                      o.status !== "rejected" &&
                      o.status !== "expired" && <OfferToOrderButton offerId={o.id} />
                    )}
                  </div>
                )}

                {(o.productionDays || o.paymentTerms) && (
                  <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-ink/10 px-5 py-2.5 text-xs text-ink/55">
                    {o.productionDays && (
                      <span>Срок изготовления: {o.productionDays} раб. дн.</span>
                    )}
                    {Number(o.prepaymentPercent ?? 0) > 0 && (
                      <span>Предоплата: {Number(o.prepaymentPercent)}%</span>
                    )}
                    {o.paymentTerms && <span>{o.paymentTerms}</span>}
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AdminPager page={page} perPage={PER_PAGE} total={Number(total)} basePath="/admin/offers" params={sp} />

      <p className="mt-6 text-xs text-ink/45">
        Печать КП в PDF - следующим шагом.
      </p>
    </AdminPage>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="flex gap-6">
      <span className="text-ink/55">{label}</span>
      <span
        className={cn(
          "min-w-28 text-right font-mono tabular-nums",
          strong ? "text-base text-ink" : "text-ink/70",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
    </div>
  );
}
