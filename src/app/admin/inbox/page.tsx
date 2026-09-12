import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { Mail, MessageSquare, Phone, Star, Send } from "lucide-react";
import { db } from "@/db";
import { contactMessages, reviews, products, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { AdminPager, offsetOf, pageFrom } from "@/components/admin/AdminPager";
import { can } from "@/lib/permissions";
import {
  MessageStatusButton,
  DeleteMessageButton,
  ReviewControls,
} from "./InboxControls";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Сообщения с сайта · Админка",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Как клиент просил с ним связаться. */
const CONTACT_WAY = {
  phone: { label: "Позвонить", icon: Phone },
  telegram: { label: "Телеграм", icon: Send },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
  email: { label: "Написать на почту", icon: Mail },
} as const;

const REVIEW_STATUS = {
  pending: { label: "На проверке", className: "bg-navy/12 text-navy" },
  approved: { label: "Опубликован", className: "bg-ok/15 text-ok" },
  rejected: { label: "Отклонён", className: "bg-danger/12 text-danger" },
} as const;

/** Обращения и отзывы листаются независимо: у каждого списка свой номер страницы. */
const PER_PAGE = 30;

export default async function AdminInbox({ searchParams }: PageProps<"/admin/inbox">) {
  if (!(await can("messaging", "view"))) {
    return (
      <AdminPage title="Сообщения с сайта">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть сообщения." />
      </AdminPage>
    );
  }

  const sp = await searchParams;
  const onlyNew = sp.filter === "new";
  const page = pageFrom(sp.page);
  const reviewPage = pageFrom(sp.rpage);

  const [messages, byStatus, reviewRows, reviewCounts] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(onlyNew ? eq(contactMessages.status, "new") : undefined)
      .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
      .limit(PER_PAGE)
      .offset(offsetOf(page, PER_PAGE)),
    db
      .select({ status: contactMessages.status, n: count() })
      .from(contactMessages)
      .groupBy(contactMessages.status),
    db
      .select({
        id: reviews.id,
        name: reviews.name,
        rating: reviews.rating,
        message: reviews.message,
        status: reviews.status,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        productName: products.name,
        productId: reviews.productId,
        authorEmail: users.email,
      })
      .from(reviews)
      .leftJoin(products, eq(products.id, reviews.productId))
      .leftJoin(users, eq(users.id, reviews.userId))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(PER_PAGE)
      .offset(offsetOf(reviewPage, PER_PAGE)),
    db.select({ status: reviews.status, n: count() }).from(reviews).groupBy(reviews.status),
  ]);

  const canEdit = await can("messaging", "edit");
  const messageCount = new Map(byStatus.map((r) => [r.status, Number(r.n)]));
  const totalMessages = byStatus.reduce((s, r) => s + Number(r.n), 0);
  const shownMessages = onlyNew ? (messageCount.get("new") ?? 0) : totalMessages;
  const totalReviews = reviewCounts.reduce((s, r) => s + Number(r.n), 0);
  const pendingReviews = Number(
    reviewCounts.find((r) => r.status === "pending")?.n ?? 0,
  );

  return (
    <AdminPage
      title="Сообщения с сайта"
      subtitle="Форма обратной связи и отзывы. Обращения из кабинета - в «Поддержке»"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Всего обращений" value={String(totalMessages)} />
        <AdminStat
          label="Новых"
          value={String(messageCount.get("new") ?? 0)}
          tone={(messageCount.get("new") ?? 0) > 0 ? "warn" : "plain"}
        />
        <AdminStat label="Отзывов" value={String(reviewRows.length)} />
        <AdminStat
          label="Отзывов на проверке"
          value={String(pendingReviews)}
          tone={pendingReviews > 0 ? "warn" : "plain"}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-ink">Форма обратной связи</h2>
          <nav className="flex gap-2">
            <Chip href="/admin/inbox" active={!onlyNew}>
              Все · {totalMessages}
            </Chip>
            <Chip href="/admin/inbox?filter=new" active={onlyNew}>
              Новые · {messageCount.get("new") ?? 0}
            </Chip>
          </nav>
        </div>

        {messages.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty title={onlyNew ? "Новых обращений нет" : "Обращений нет"} />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {messages.map((m) => {
              const way =
                CONTACT_WAY[(m.preferredContact ?? "email") as keyof typeof CONTACT_WAY] ??
                CONTACT_WAY.email;
              const Icon = way.icon;
              const isNew = m.status === "new";

              return (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-xl border bg-bone px-5 py-4",
                    isNew ? "border-warn/40" : "border-ink/10 opacity-80",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                    <div className="min-w-64 flex-1">
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span className="text-ink">{m.name}</span>
                        {isNew && (
                          <span className="rounded bg-warn/15 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-warn">
                            НОВОЕ
                          </span>
                        )}
                      </span>

                      <p className="mt-1.5 whitespace-pre-line text-sm text-ink/70">
                        {m.message}
                      </p>

                      <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink/45">
                        <span className="flex items-center gap-1">
                          <Icon className="size-3" aria-hidden />
                          {way.label}
                        </span>
                        <a
                          href={`mailto:${m.email}`}
                          className="font-mono hover:text-brand"
                        >
                          {m.email}
                        </a>
                        {m.phone && (
                          <a
                            href={`tel:${m.phone.replace(/\D/g, "")}`}
                            className="font-mono hover:text-brand"
                          >
                            {m.phone}
                          </a>
                        )}
                        {m.createdAt && <span>{dt.format(m.createdAt)}</span>}
                        {!m.agreement && (
                          <span className="text-warn">
                            согласие на обработку не отмечено
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap items-center gap-5 border-t border-ink/8 pt-3">
                      <MessageStatusButton messageId={m.id} status={m.status} />
                      <DeleteMessageButton messageId={m.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <AdminPager page={page} perPage={PER_PAGE} total={shownMessages} basePath="/admin/inbox" params={sp} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-ink">Отзывы</h2>

        {reviewRows.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty
              title="Отзывов нет"
              text="Клиенты оставляют их в карточке товара после выполненного заказа."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {reviewRows.map((r) => {
              const st =
                REVIEW_STATUS[(r.status ?? "pending") as keyof typeof REVIEW_STATUS] ??
                REVIEW_STATUS.pending;

              return (
                <li key={r.id} className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                    <div className="min-w-64 flex-1">
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span className="text-ink">{r.name}</span>
                        <span
                          className="flex items-center gap-0.5"
                          aria-label={`Оценка ${r.rating} из 5`}
                        >
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "size-3",
                                i < r.rating
                                  ? "fill-warn text-warn"
                                  : "text-ink/20",
                              )}
                              aria-hidden
                            />
                          ))}
                        </span>
                      </span>

                      <p className="mt-1.5 whitespace-pre-line text-sm text-ink/70">
                        {r.message}
                      </p>

                      <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink/45">
                        {r.productId && (
                          <Link
                            href={`/admin/products/${r.productId}`}
                            className="hover:text-brand"
                          >
                            {r.productName ?? `товар ${r.productId}`}
                          </Link>
                        )}
                        {r.authorEmail && (
                          <span className="font-mono">{r.authorEmail}</span>
                        )}
                        {r.createdAt && <span>{dt.format(r.createdAt)}</span>}
                      </p>

                      {r.comment && (
                        <p className="mt-2 rounded-lg bg-ink/5 px-3 py-2 text-xs text-ink/60">
                          Заметка модератора: {r.comment}
                        </p>
                      )}
                    </div>

                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                  </div>

                  {canEdit && (
                    <div className="mt-3 border-t border-ink/8 pt-3">
                      <ReviewControls
                        reviewId={r.id}
                        status={r.status}
                        comment={r.comment ?? ""}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <AdminPager page={reviewPage} perPage={PER_PAGE} total={totalReviews} basePath="/admin/inbox" params={sp} param="rpage" />
      </section>
    </AdminPage>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3.5 py-1.5 text-xs",
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-ink/12 text-ink/60 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
