import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, asc } from "drizzle-orm";
import { ArrowLeft, Printer } from "lucide-react";
import { db } from "@/db";
import {
  documents,
  documentCategories,
  documentTemplates,
  documentHistory,
  users,
} from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { docStatus, docType, safeDocumentHtml, DOC_ACTIONS } from "@/lib/documents";
import { DocumentStatusForm } from "./StatusForm";
import { DocumentBody } from "@/components/admin/DocumentBody";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Документ · Админка",
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
  year: "numeric",
});
const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminDocument({ params }: PageProps<"/admin/documents/[id]">) {
  if (!(await can("documents", "view"))) {
    return (
      <AdminPage title="Документ">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть документы." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const docId = parseId(id);
  if (docId === null) notFound();

  const [doc] = await db
    .select({
      id: documents.id,
      number: documents.documentNumber,
      title: documents.title,
      content: documents.content,
      status: documents.status,
      docType: documents.docType,
      amount: documents.amount,
      currency: documents.currency,
      documentDate: documents.documentDate,
      validUntil: documents.validUntil,
      orderId: documents.orderId,
      views: documents.viewsCount,
      signedAt: documents.signedAt,
      clientSigned: documents.clientSigned,
      createdAt: documents.createdAt,
      categoryName: documentCategories.name,
      templateName: documentTemplates.name,
      clientName: users.name,
      clientCompany: users.companyName,
      clientEmail: users.email,
    })
    .from(documents)
    .leftJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(documentTemplates, eq(documents.templateId, documentTemplates.id))
    .leftJoin(users, eq(documents.userId, users.id))
    .where(eq(documents.id, docId))
    .limit(1);

  if (!doc) notFound();

  const history = await db
    .select({
      id: documentHistory.id,
      action: documentHistory.action,
      comment: documentHistory.comment,
      createdAt: documentHistory.createdAt,
      userName: users.name,
    })
    .from(documentHistory)
    .leftJoin(users, eq(documentHistory.userId, users.id))
    .where(eq(documentHistory.documentId, docId))
    .orderBy(desc(documentHistory.createdAt), asc(documentHistory.id));

  const st = docStatus(doc.status);
  const html = safeDocumentHtml(doc.content);
  const canEdit = await can("documents", "edit");

  return (
    <AdminPage
      title={doc.title}
      subtitle={`${doc.number ?? `#${doc.id}`} · ${doc.categoryName ?? "без категории"} · ${docType(doc.docType)}`}
      actions={
        <>
          <Link
            href="/admin/documents"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            К СПИСКУ
          </Link>
          {doc.orderId && (
            <Link
              href={`/print/invoice/site/${doc.orderId}`}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright"
            >
              <Printer className="size-3.5" aria-hidden />
              СЧЁТ ПО ЗАКАЗУ
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section className="order-2 lg:order-1">
          {html ? (
            <DocumentBody html={html} />
          ) : (
            <AdminEmpty
              title="Тело документа пустое"
              text="У этой записи нет сохранённого содержимого - только карточка."
            />
          )}
        </section>

        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <span
              className={cn(
                "inline-block rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                st.className,
              )}
            >
              {st.label}
            </span>

            {canEdit && <DocumentStatusForm documentId={doc.id} status={doc.status} />}

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <Row
                label="Дата документа"
                value={
                  doc.documentDate
                    ? dt.format(new Date(`${doc.documentDate}T00:00:00`))
                    : "-"
                }
              />
              {doc.validUntil && (
                <Row
                  label="Действует до"
                  value={dt.format(new Date(`${doc.validUntil}T00:00:00`))}
                />
              )}
              <Row
                label="Сумма"
                value={doc.amount ? money.format(Number(doc.amount)) : "-"}
              />
              <Row label="Шаблон" value={doc.templateName ?? "-"} />
              <Row label="Просмотров" value={String(doc.views ?? 0)} />
              {doc.createdAt && (
                <Row label="Создан" value={dtTime.format(doc.createdAt)} />
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              КОНТРАГЕНТ
            </h2>
            {doc.clientName ? (
              <div className="mt-2.5 text-sm">
                <p className="text-ink">{doc.clientCompany || doc.clientName}</p>
                {doc.clientCompany && (
                  <p className="text-xs text-ink/50">{doc.clientName}</p>
                )}
                {doc.clientEmail && (
                  <p className="mt-1 font-mono text-xs text-ink/50">{doc.clientEmail}</p>
                )}
              </div>
            ) : (
              <p className="mt-2.5 text-sm text-ink/45">
                Не привязан - документ заполняли вручную.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              ИСТОРИЯ
            </h2>
            {history.length === 0 ? (
              <p className="mt-2.5 text-sm text-ink/45">Записей нет.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-2.5 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-col border-l-2 border-ink/12 pl-3">
                    <span className="text-ink/75">
                      {DOC_ACTIONS[h.action] ?? h.action}
                      {h.userName && <span className="text-ink/45"> · {h.userName}</span>}
                    </span>
                    {h.createdAt && (
                      <span className="font-mono text-xs text-ink/40">
                        {dtTime.format(h.createdAt)}
                      </span>
                    )}
                    {h.comment && <span className="text-xs text-ink/55">{h.comment}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </AdminPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-right font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}
