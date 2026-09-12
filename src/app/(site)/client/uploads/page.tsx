import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { Download, Link2 } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { orders, clientUploads } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { uploadStatus, formatFileSize, extensionOf } from "@/lib/client-portal";
import { statusOf } from "@/lib/order-status";
import { UploadForm } from "./UploadForm";
import { DeleteFileButton } from "./DeleteFileButton";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Мои файлы",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

export default async function ClientUploadsPage({
  searchParams,
}: PageProps<"/client/uploads">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/uploads");

  const userId = Number(user.id);
  const sp = await searchParams;
  const orderFilter = Number(sp.order) || 0;

  const [myOrders, files] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt)),
    db
      .select()
      .from(clientUploads)
      .where(eq(clientUploads.userId, userId))
      .orderBy(desc(clientUploads.createdAt)),
  ]);

  const orderOptions = myOrders.map((o) => ({
    id: o.id,
    label: `№ ${o.id} · ${statusOf(o.status).label}${
      o.createdAt ? ` · ${shortDate.format(o.createdAt)}` : ""
    }`,
  }));

  const visible = orderFilter ? files.filter((f) => f.orderId === orderFilter) : files;

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Мои файлы"
        lead="Макеты, логотипы и исходники к заказам. Менеджер проверит файл и напишет, если что-то нужно поправить."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/uploads", label: "Файлы" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <UploadForm
            orders={orderOptions}
            defaultOrderId={orderFilter || undefined}
          />

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-2xl text-ink">
              Загружено{files.length > 0 && `: ${files.length}`}
            </h2>

            {orderFilter > 0 && (
              <Link
                href="/client/uploads"
                className="text-sm text-brand hover:text-brand-bright"
              >
                Показать все файлы
              </Link>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="mt-5 rounded-card border border-dashed border-ink/20 bg-bone/60 px-6 py-10 text-center text-ink/55">
              {orderFilter > 0
                ? `К заказу № ${orderFilter} файлов ещё нет.`
                : "Файлов пока нет. Загрузите макет - он попадёт прямо к менеджеру."}
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-3">
              {visible.map((f) => {
                const st = uploadStatus(f.status);
                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-card border border-ink/10 bg-bone/85 px-6 py-5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-card bg-ink/6 font-mono text-[0.65rem] uppercase text-ink/50">
                      {extensionOf(f.originalName) || "файл"}
                    </span>

                    <div className="min-w-48 flex-1">
                      <a
                        href={`/api/uploads/${f.id}`}
                        className="flex items-center gap-2 text-ink hover:text-brand"
                      >
                        <span className="break-all">{f.originalName}</span>
                        <Download className="size-3.5 shrink-0" aria-hidden />
                      </a>

                      {f.description && (
                        <p className="mt-0.5 text-sm text-ink/55">{f.description}</p>
                      )}

                      <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink/40">
                        <span>{formatFileSize(f.fileSize)}</span>
                        {f.createdAt && <span>{dt.format(f.createdAt)}</span>}
                        {f.orderId && (
                          <Link
                            href={`/client/orders/${f.orderId}`}
                            className="flex items-center gap-1 hover:text-brand"
                          >
                            <Link2 className="size-3" aria-hidden />
                            заказ № {f.orderId}
                          </Link>
                        )}
                      </p>

                      {f.adminComment && (
                        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
                          {f.adminComment}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={cn(
                          "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                          st.className,
                        )}
                      >
                        {st.label}
                      </span>
                      {f.status !== "approved" && <DeleteFileButton fileId={f.id} />}
                    </div>
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
