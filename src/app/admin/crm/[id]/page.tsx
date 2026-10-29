import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Building2, Mail, Phone, User, BellRing } from "lucide-react";
import { db } from "@/db";
import { crmLeads, crmInteractions, crmReminders, users } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  leadStatus,
  leadSource,
  leadPriority,
  readTags,
  interactionType,
  INTERACTION_DIRECTION,
} from "@/lib/crm";
import {
  LeadStatusControls,
  InteractionForm,
  ReminderForm,
  ConvertLeadButton,
} from "./LeadControls";
import { CompleteReminderButton } from "../ReminderControls";
import { cn } from "@/lib/cn";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Лид · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminLead({ params }: PageProps<"/admin/crm/[id]">) {
  if (!(await can("crm", "view"))) {
    return (
      <AdminPage title="Лид">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть клиентов." />
      </AdminPage>
    );
  }

  const { id } = await params;
  const leadId = parseId(id);
  if (leadId === null) notFound();

  const [lead] = await db
    .select({
      id: crmLeads.id,
      name: crmLeads.name,
      company: crmLeads.company,
      email: crmLeads.email,
      phone: crmLeads.phone,
      source: crmLeads.source,
      status: crmLeads.status,
      priority: crmLeads.priority,
      expectedRevenue: crmLeads.expectedRevenue,
      expectedCloseDate: crmLeads.expectedCloseDate,
      lossReason: crmLeads.lossReason,
      notes: crmLeads.notes,
      tags: crmLeads.tags,
      userId: crmLeads.userId,
      clientId: crmLeads.clientId,
      createdAt: crmLeads.createdAt,
      assigneeName: users.name,
    })
    .from(crmLeads)
    .leftJoin(users, eq(users.id, crmLeads.assignedTo))
    .where(eq(crmLeads.id, leadId))
    .limit(1);

  if (!lead) notFound();

  const [interactions, reminders] = await Promise.all([
    db
      .select({
        id: crmInteractions.id,
        type: crmInteractions.type,
        direction: crmInteractions.direction,
        subject: crmInteractions.subject,
        description: crmInteractions.description,
        result: crmInteractions.result,
        durationMinutes: crmInteractions.durationMinutes,
        createdAt: crmInteractions.createdAt,
        author: users.name,
      })
      .from(crmInteractions)
      .leftJoin(users, eq(users.id, crmInteractions.createdBy))
      .where(eq(crmInteractions.leadId, leadId))
      .orderBy(desc(crmInteractions.createdAt), desc(crmInteractions.id)),
    db
      .select({
        id: crmReminders.id,
        message: crmReminders.message,
        remindAt: crmReminders.remindAt,
        isCompleted: crmReminders.isCompleted,
        assignee: users.name,
      })
      .from(crmReminders)
      .leftJoin(users, eq(users.id, crmReminders.assignedTo))
      .where(eq(crmReminders.leadId, leadId))
      .orderBy(asc(crmReminders.isCompleted), asc(crmReminders.remindAt)),
  ]);

  const canEdit = await can("crm", "edit");
  const st = leadStatus(lead.status);
  const pr = leadPriority(lead.priority);
  const tags = readTags(lead.tags);
  const now = new Date();

  return (
    <AdminPage
      title={lead.name}
      subtitle={[
        lead.company,
        leadSource(lead.source),
        lead.createdAt && `заведён ${dt.format(lead.createdAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          <Link
            href="/admin/crm"
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            К ВОРОНКЕ
          </Link>
          {lead.userId && (
            <Link
              href={`/admin/clients/${lead.userId}`}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 font-display text-xs tracking-wider text-ink/70 hover:border-ink/30 hover:text-ink"
            >
              <User className="size-3.5" aria-hidden />
              КАРТОЧКА КЛИЕНТА
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {canEdit && (
            <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                СТАДИЯ
              </h2>
              <div className="mt-3">
                <LeadStatusControls
                  leadId={lead.id}
                  status={lead.status}
                  lossReason={lead.lossReason ?? ""}
                />
              </div>
            </section>
          )}

          {canEdit && (
            <section className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
              <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
                ДОГОВОРИЛИСЬ?
              </h2>
              <p className="mt-2 text-sm text-ink/55">
                Из лида получится контрагент - с его именем, телефоном и почтой.
                Дальше на него можно заводить заказы.
              </p>
              <div className="mt-3">
                <ConvertLeadButton leadId={lead.id} clientId={lead.clientId} />
              </div>
            </section>
          )}

          {canEdit && <InteractionForm leadId={lead.id} />}

          <section>
            <h2 className="font-display text-lg text-ink">
              История касаний{interactions.length > 0 && ` - ${interactions.length}`}
            </h2>

            {interactions.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">
                Пока пусто. Запишите звонок или встречу - по этой ленте потом
                восстанавливается вся история отношений.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {interactions.map((i) => (
                  <li
                    key={i.id}
                    className="rounded-xl border border-ink/10 bg-bone px-5 py-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded bg-ink/8 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-ink/65">
                          {interactionType(i.type)}
                        </span>
                        {i.direction && (
                          <span className="text-xs text-ink/45">
                            {
                              INTERACTION_DIRECTION[
                                i.direction as keyof typeof INTERACTION_DIRECTION
                              ]
                            }
                          </span>
                        )}
                        {i.subject && <span className="text-ink">{i.subject}</span>}
                      </span>

                      <span className="font-mono text-xs text-ink/40">
                        {i.createdAt && dtTime.format(i.createdAt)}
                        {i.author && ` · ${i.author}`}
                        {i.durationMinutes !== null && ` · ${i.durationMinutes} мин`}
                      </span>
                    </div>

                    {i.description && (
                      <p className="mt-1.5 whitespace-pre-line text-sm text-ink/70">
                        {i.description}
                      </p>
                    )}
                    {i.result && (
                      <p className="mt-1.5 rounded-lg bg-brand/8 px-3 py-1.5 text-sm text-ink/75">
                        Итог: {i.result}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <span
              className={cn(
                "inline-block rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                st.className,
              )}
            >
              {st.label}
            </span>

            {lead.lossReason && (
              <p className="mt-2 rounded-lg bg-danger/8 px-3 py-2 text-xs text-danger">
                {lead.lossReason}
              </p>
            )}

            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {lead.company && (
                <li className="flex items-center gap-2 text-ink/70">
                  <Building2 className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  {lead.company}
                </li>
              )}
              {lead.phone && (
                <li className="flex items-center gap-2 text-ink/70">
                  <Phone className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  <a
                    href={`tel:${lead.phone.replace(/\D/g, "")}`}
                    className="hover:text-brand"
                  >
                    {lead.phone}
                  </a>
                </li>
              )}
              {lead.email && (
                <li className="flex items-center gap-2 text-ink/70">
                  <Mail className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  <a href={`mailto:${lead.email}`} className="truncate hover:text-brand">
                    {lead.email}
                  </a>
                </li>
              )}
              {lead.assigneeName && (
                <li className="flex items-center gap-2 text-ink/70">
                  <User className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  {lead.assigneeName}
                </li>
              )}
            </ul>

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-ink/10 pt-3 text-sm">
              {Number(lead.expectedRevenue ?? 0) > 0 && (
                <Row
                  label="Ожидаем"
                  value={money.format(Number(lead.expectedRevenue))}
                />
              )}
              {lead.expectedCloseDate && (
                <Row
                  label="Решение к"
                  value={dt.format(new Date(`${lead.expectedCloseDate}T00:00:00`))}
                />
              )}
              {lead.priority !== "medium" && (
                <Row label="Важность" value={pr.label} />
              )}
            </dl>

            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-ink/6 px-2 py-0.5 text-xs text-ink/55"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {lead.notes && (
              <p className="mt-3 whitespace-pre-line border-t border-ink/10 pt-3 text-sm text-ink/65">
                {lead.notes}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-ink/10 bg-bone p-5">
            <h2 className="flex items-center gap-2 font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
              <BellRing className="size-3.5" aria-hidden />
              НАПОМИНАНИЯ
            </h2>

            {reminders.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                {reminders.map((r) => {
                  const due = !r.isCompleted && r.remindAt.getTime() <= now.getTime();
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "border-l-2 pl-3",
                        r.isCompleted
                          ? "border-ink/12 opacity-55"
                          : due
                            ? "border-warn"
                            : "border-brand/40",
                      )}
                    >
                      <span className={cn(r.isCompleted && "line-through")}>
                        {r.message}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-ink/40">
                        {dtTime.format(r.remindAt)}
                        {r.assignee && ` · ${r.assignee}`}
                      </span>
                      {canEdit && !r.isCompleted && (
                        <span className="mt-1 block">
                          <CompleteReminderButton reminderId={r.id} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canEdit && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <ReminderForm leadId={lead.id} />
              </div>
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
