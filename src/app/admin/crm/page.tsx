import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, count, sql, and, lte, or, gte, notInArray } from "drizzle-orm";
import { BellRing, Building2, Mail, Phone, User } from "lucide-react";
import { db } from "@/db";
import { crmLeads, crmReminders, users } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { staffOptions as loadStaffOptions } from "@/lib/staff-db";
import { currentUser } from "@/auth";
import {
  leadSource,
  leadPriority,
  readTags,
  isLeadClosed,
  PIPELINE,
  LEAD_STATUS,
} from "@/lib/crm";
import { LeadForm, type StaffOption } from "./LeadForm";
import { CompleteReminderButton } from "./ReminderControls";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "CRM · Админка",
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
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Воронка продаж.
 *
 * Колонки - стадии лида. Выигранные и проигранные остаются в конце: по
 * ним видно, чем кончались похожие сделки.
 */
export default async function AdminCrm() {
  if (!(await can("crm", "view"))) {
    return (
      <AdminPage title="CRM">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть клиентов." />
      </AdminPage>
    );
  }

  const user = await currentUser();

  // Граница для закрытых лидов на доске - три месяца назад
  const closedSince = new Date();
  closedSince.setDate(closedSince.getDate() - 90);

  const [leads, staff, byStatus, dueReminders] = await Promise.all([
    db
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
        tags: crmLeads.tags,
        updatedAt: crmLeads.updatedAt,
        assigneeName: users.name,
      })
      .from(crmLeads)
      .leftJoin(users, eq(users.id, crmLeads.assignedTo))
      // Доска показывает все живые лиды, а закрытые - только за последние
      // три месяца: выигранные и проигранные копятся годами и растягивали
      // бы последние колонки до бесконечности. Итоги по стадиям считаются
      // отдельным запросом по всем лидам
      .where(
        or(
          notInArray(crmLeads.status, ["won", "lost"]),
          gte(crmLeads.updatedAt, closedSince),
        ),
      )
      .orderBy(desc(crmLeads.updatedAt), desc(crmLeads.id)),
    loadStaffOptions(),
    db
      .select({
        status: crmLeads.status,
        n: count(),
        revenue: sql<string>`coalesce(sum(${crmLeads.expectedRevenue}), 0)`,
      })
      .from(crmLeads)
      .groupBy(crmLeads.status),
    // Напоминания, которым уже пора: только свои и только незакрытые
    user
      ? db
          .select({
            id: crmReminders.id,
            message: crmReminders.message,
            remindAt: crmReminders.remindAt,
            leadId: crmReminders.leadId,
            leadName: crmLeads.name,
          })
          .from(crmReminders)
          .leftJoin(crmLeads, eq(crmLeads.id, crmReminders.leadId))
          .where(
            and(
              eq(crmReminders.assignedTo, Number(user.id)),
              eq(crmReminders.isCompleted, false),
              lte(crmReminders.remindAt, new Date()),
            ),
          )
          .orderBy(asc(crmReminders.remindAt))
      : [],
  ]);

  const canEdit = await can("crm", "edit");
  const stats = new Map(
    byStatus.map((r) => [r.status, { n: Number(r.n), revenue: Number(r.revenue) }]),
  );

  const total = byStatus.reduce((s, r) => s + Number(r.n), 0);
  const open = leads.filter((l) => !isLeadClosed(l.status)).length;
  const openRevenue = leads
    .filter((l) => !isLeadClosed(l.status))
    .reduce((s, l) => s + Number(l.expectedRevenue ?? 0), 0);
  const won = stats.get("won");

  const staffOptions: StaffOption[] = staff;

  return (
    <AdminPage title="CRM" subtitle="Лиды, касания и напоминания">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Всего лидов" value={String(total)} />
        <AdminStat label="В работе" value={String(open)} tone={open > 0 ? "brand" : "plain"} />
        <AdminStat
          label="Ожидаем выручки"
          value={money.format(openRevenue)}
          hint="по незакрытым сделкам"
        />
        <AdminStat
          label="Выиграно"
          value={won ? money.format(won.revenue) : money.format(0)}
          hint={`сделок: ${won?.n ?? 0}`}
        />
      </div>

      {dueReminders.length > 0 && (
        <section className="mt-6 rounded-xl border border-warn/30 bg-warn/8 px-5 py-4">
          <h2 className="flex items-center gap-2.5 font-display text-[0.62rem] tracking-[0.18em] text-warn">
            <BellRing className="size-4" aria-hidden />
            ПОРА НАПОМНИТЬ
          </h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {dueReminders.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="text-ink/80">
                  {r.message}
                  {r.leadId && (
                    <Link
                      href={`/admin/crm/${r.leadId}`}
                      className="ml-2 text-brand hover:text-brand-bright"
                    >
                      {r.leadName ?? `лид ${r.leadId}`}
                    </Link>
                  )}
                  <span className="ml-2 font-mono text-xs text-ink/45">
                    {dtTime.format(r.remindAt)}
                  </span>
                </span>
                {canEdit && <CompleteReminderButton reminderId={r.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <div className="mt-6">
          <LeadForm staff={staffOptions} />
        </div>
      )}

      {leads.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty
            title="Лидов нет"
            text="Заведите первый - сюда попадают обращения, из которых ещё не вышел заказ."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {PIPELINE.map((stage) => {
              const own = leads.filter((l) => (l.status ?? "new") === stage);
              const st = LEAD_STATUS[stage];
              const stageRevenue = own.reduce(
                (s, l) => s + Number(l.expectedRevenue ?? 0),
                0,
              );

              return (
                <section key={stage} className="w-72 shrink-0">
                  <header className="flex items-baseline justify-between gap-2 border-b border-ink/10 pb-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                    <span className="font-mono text-xs text-ink/40">
                      {own.length}
                      {stageRevenue > 0 && ` · ${money.format(stageRevenue)}`}
                    </span>
                  </header>

                  <ul className="mt-3 flex flex-col gap-2">
                    {own.map((l) => {
                      const pr = leadPriority(l.priority);
                      const tags = readTags(l.tags);

                      return (
                        <li key={l.id}>
                          <Link
                            href={`/admin/crm/${l.id}`}
                            className="block rounded-lg border border-ink/10 bg-bone p-3 transition-colors hover:border-brand/40"
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-sm text-ink">{l.name}</span>
                              {l.priority !== "medium" && (
                                <span className={cn("text-[0.65rem]", pr.className)}>
                                  {pr.label}
                                </span>
                              )}
                            </span>

                            {l.company && (
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/55">
                                <Building2 className="size-3" aria-hidden />
                                {l.company}
                              </span>
                            )}

                            <span className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink/45">
                              {l.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone className="size-3" aria-hidden />
                                  {l.phone}
                                </span>
                              )}
                              {l.email && (
                                <span className="flex items-center gap-1.5 truncate">
                                  <Mail className="size-3 shrink-0" aria-hidden />
                                  {l.email}
                                </span>
                              )}
                              {l.assigneeName && (
                                <span className="flex items-center gap-1.5">
                                  <User className="size-3" aria-hidden />
                                  {l.assigneeName}
                                </span>
                              )}
                            </span>

                            {Number(l.expectedRevenue ?? 0) > 0 && (
                              <span className="mt-1.5 block font-mono text-sm text-ink">
                                {money.format(Number(l.expectedRevenue))}
                              </span>
                            )}

                            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.65rem] text-ink/40">
                              <span>{leadSource(l.source)}</span>
                              {l.expectedCloseDate && (
                                <span>
                                  до{" "}
                                  {dt.format(new Date(`${l.expectedCloseDate}T00:00:00`))}
                                </span>
                              )}
                            </span>

                            {tags.length > 0 && (
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {tags.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded bg-ink/6 px-1.5 py-0.5 text-[0.65rem] text-ink/55"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}

                    {own.length === 0 && (
                      <li className="rounded-lg border border-dashed border-ink/12 px-3 py-4 text-center text-xs text-ink/35">
                        пусто
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </AdminPage>
  );
}
