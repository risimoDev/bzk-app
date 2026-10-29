"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, crmLeads, crmInteractions, crmReminders } from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { isActiveStaff } from "@/lib/staff-db";
import { parseId } from "@/lib/ids";
import {
  LEAD_STATUS,
  LEAD_SOURCE,
  LEAD_PRIORITY,
  INTERACTION_TYPE,
  hasDirection,
  type LeadStatus,
  type LeadSource,
  type LeadPriority,
  type InteractionType,
} from "@/lib/crm";
import { isKeyOf } from "@/lib/guards";
import { parseCalendarDate, parseCalendarDateTime } from "@/lib/dates";
import { rejectOverlong } from "@/lib/text-limits";

export type CrmState = { ok: boolean; message?: string };

const DENIED: CrmState = { ok: false, message: "Нет прав на CRM" };

/**
 * Право на CRM - свой модуль `crm`. Раньше раздел был закрыт правом на
 * клиентов (`users`), и выдать сотруднику лиды значило пустить его к
 * блокировке аккаунтов. Страница проверяет право сама - из файла с
 * «use server» такую проверку наружу не отдаём, иначе она станет ещё
 * одним открытым эндпоинтом.
 */
async function mayEdit() {
  return can("crm", "edit");
}

// ----------------------------------------------------------------- лиды

export async function createLead(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayEdit())) return DENIED;

  const name = String(formData.get("name") ?? "").trim().slice(0, 255);
  const company = String(formData.get("company") ?? "").trim().slice(0, 255);
  const email = String(formData.get("email") ?? "").trim().slice(0, 255);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 50);
  const notes = String(formData.get("notes") ?? "").trim();
  const tags = String(formData.get("tags") ?? "").trim().slice(0, 500);

  const rawSource = String(formData.get("source") ?? "website");
  const source = (isKeyOf(LEAD_SOURCE, rawSource) ? rawSource : "website") as LeadSource;

  const rawPriority = String(formData.get("priority") ?? "medium");
  const priority = (isKeyOf(LEAD_PRIORITY, rawPriority) ? rawPriority : "medium") as LeadPriority;

  const rawRevenue = String(formData.get("expectedRevenue") ?? "").trim();
  const rawCloseDate = String(formData.get("expectedCloseDate") ?? "").trim();

  const rawAssignee = String(formData.get("assignedTo") ?? "").trim();
  const assignedTo = rawAssignee === "" ? null : parseId(rawAssignee);

  if (rawAssignee !== "" && assignedTo === null) {
    return { ok: false, message: "Ответственный не найден" };
  }
  if (name === "") return { ok: false, message: "Впишите имя или название компании" };
  if (email === "" && phone === "") {
    return { ok: false, message: "Нужен хотя бы один контакт - почта или телефон" };
  }
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Проверьте адрес почты" };
  }

  let expectedRevenue: string | null = null;
  if (rawRevenue !== "") {
    const value = Number(rawRevenue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, message: "Ожидаемая сумма должна быть числом" };
    }
    expectedRevenue = value.toFixed(2);
  }

  const closeDate = rawCloseDate === "" ? null : parseCalendarDate(rawCloseDate);
  if (rawCloseDate !== "" && !closeDate) {
    return { ok: false, message: "Проверьте дату закрытия" };
  }

  // Ответственный - действующий сотрудник: id клиента в форму подставить
  // можно, и лид повис бы на человеке без доступа в админку
  if (assignedTo !== null && !(await isActiveStaff(assignedTo))) {
    return { ok: false, message: "Ответственный не найден" };
  }

  const [createdLead] = await db
    .insert(crmLeads)
    .values({
      name,
      company: company || null,
      email: email || null,
      phone: phone || null,
      source,
      priority,
      assignedTo,
      expectedRevenue,
      // Столбец календарный: строка «ГГГГ-ММ-ДД» уходит как есть
      expectedCloseDate: closeDate,
      notes: notes || null,
      tags: tags || null,
      createdBy: Number(user.id),
    })
    .returning({ id: crmLeads.id });

  await audit("crm.lead_create", { type: "crm_lead", id: createdLead.id }, { assignedTo });

  revalidatePath("/admin/crm");
  return { ok: true, message: "Лид заведён" };
}

export async function setLeadStatus(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  if (!(await mayEdit())) return DENIED;

  const leadId = Number(formData.get("leadId"));
  const raw = String(formData.get("status") ?? "");
  const lossReason = String(formData.get("lossReason") ?? "").trim();

  if (!Number.isInteger(leadId)) return { ok: false, message: "Лид не найден" };
  if (!isKeyOf(LEAD_STATUS, raw)) return { ok: false, message: "Неизвестный статус" };

  const status = raw as LeadStatus;

  // Проигранная сделка без причины ничему не учит: через полгода никто
  // не вспомнит, ушёл клиент по цене или по срокам
  if (status === "lost" && lossReason === "") {
    return { ok: false, message: "Напишите, почему сделка не состоялась" };
  }

  const updated = await db
    .update(crmLeads)
    .set({
      status,
      lossReason: status === "lost" ? lossReason : null,
      updatedAt: new Date(),
    })
    .where(eq(crmLeads.id, leadId))
    .returning({ id: crmLeads.id });

  if (updated.length === 0) return { ok: false, message: "Лид не найден" };

  await audit("crm.lead_status", { type: "crm_lead", id: leadId }, { status });

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${leadId}`);
  return { ok: true, message: LEAD_STATUS[status].label };
}

// --------------------------------------------------------- касания

export async function logInteraction(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayEdit())) return DENIED;

  const leadId = Number(formData.get("leadId"));
  const rawType = String(formData.get("type") ?? "note");
  const type = (isKeyOf(INTERACTION_TYPE, rawType) ? rawType : "note") as InteractionType;
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 255);
  const description = String(formData.get("description") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const rawDirection = String(formData.get("direction") ?? "").trim();
  const rawDuration = String(formData.get("durationMinutes") ?? "").trim();

  if (!Number.isInteger(leadId)) return { ok: false, message: "Лид не найден" };
  if (description === "" && subject === "") {
    return { ok: false, message: "Опишите, о чём говорили" };
  }

  const [lead] = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(eq(crmLeads.id, leadId))
    .limit(1);

  if (!lead) return { ok: false, message: "Лид не найден" };

  // Направление сохраняем только там, где оно имеет смысл: у встречи
  // «входящая» не бывает
  const direction =
    hasDirection(type) && (rawDirection === "incoming" || rawDirection === "outgoing")
      ? rawDirection
      : null;

  let durationMinutes: number | null = null;
  if (rawDuration !== "") {
    const value = Number(rawDuration);
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, message: "Длительность - целое число минут" };
    }
    durationMinutes = value;
  }

  await db.transaction(async (tx) => {
    await tx.insert(crmInteractions).values({
      leadId,
      type,
      direction,
      subject: subject || null,
      description: description || null,
      result: result || null,
      durationMinutes,
      completedAt: new Date(),
      createdBy: Number(user.id),
    });

    // Любое касание двигает лид: по updated_at видно, кем давно не занимались
    await tx.update(crmLeads).set({ updatedAt: new Date() }).where(eq(crmLeads.id, leadId));
  });

  revalidatePath(`/admin/crm/${leadId}`);
  revalidatePath("/admin/crm");
  return { ok: true, message: "Записано" };
}

// ----------------------------------------------------- напоминания

export async function createReminder(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const tooLong = rejectOverlong(formData, { message: 500 });
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayEdit())) return DENIED;

  const leadId = Number(formData.get("leadId"));
  const message = String(formData.get("message") ?? "").trim().slice(0, 500);
  const rawDate = String(formData.get("remindAt") ?? "").trim();

  if (!Number.isInteger(leadId)) return { ok: false, message: "Лид не найден" };
  if (message === "") return { ok: false, message: "О чём напомнить?" };

  // datetime-local отдаёт «ГГГГ-ММ-ДДTЧЧ:ММ» без часового пояса - читаем
  // как местное время, именно в нём менеджер и назначает звонок
  const remindAt = parseCalendarDateTime(rawDate);
  if (!remindAt) {
    return { ok: false, message: rawDate === "" ? "Укажите дату и время" : "Проверьте дату и время" };
  }

  const [lead] = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(eq(crmLeads.id, leadId))
    .limit(1);

  if (!lead) return { ok: false, message: "Лид не найден" };

  await db.insert(crmReminders).values({
    leadId,
    remindAt,
    message,
    assignedTo: Number(user.id),
  });

  revalidatePath(`/admin/crm/${leadId}`);
  revalidatePath("/admin/crm");
  return { ok: true, message: "Напоминание поставлено" };
}

export async function completeReminder(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const user = await currentUser();
  if (!user || !(await mayEdit())) return DENIED;

  const reminderId = Number(formData.get("reminderId"));
  if (!Number.isInteger(reminderId)) return { ok: false, message: "Напоминание не найдено" };

  const updated = await db
    .update(crmReminders)
    .set({ isCompleted: true })
    .where(
      and(
        eq(crmReminders.id, reminderId),
        // Закрывать чужое напоминание не даём: оно висит на другом человеке
        eq(crmReminders.assignedTo, Number(user.id)),
      ),
    )
    .returning({ leadId: crmReminders.leadId });

  if (updated.length === 0) {
    return { ok: false, message: "Напоминание не ваше или уже закрыто" };
  }

  revalidatePath("/admin/crm");
  if (updated[0].leadId) revalidatePath(`/admin/crm/${updated[0].leadId}`);
  return { ok: true, message: "Закрыто" };
}

/**
 * Лид → контрагент.
 *
 * До этого CRM обрывалась на лиде: договорившись, менеджер заводил
 * заказчика заново руками, и связь между «откуда пришёл» и «что заказал»
 * терялась. Здесь из лида получается контрагент, лид помечается
 * выигранным, а в историю касаний уходит запись - по ней видно, когда
 * сделка состоялась.
 */
export async function convertLeadToCounterparty(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const me = await currentUser();
  if (!me || !(await can("crm", "edit")) || !(await can("counterparties", "edit"))) {
    return { ok: false, message: "Нет прав заводить контрагентов" };
  }

  const leadId = Number(formData.get("leadId"));
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return { ok: false, message: "Лид не найден" };
  }

  const [lead] = await db
    .select()
    .from(crmLeads)
    .where(eq(crmLeads.id, leadId))
    .limit(1);
  if (!lead) return { ok: false, message: "Лид не найден" };

  if (lead.clientId) {
    return { ok: false, message: "Из этого лида контрагент уже заведён" };
  }

  const clientId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(clients)
      .values({
        name: lead.name,
        companyName: lead.company,
        phone: lead.phone,
        email: lead.email,
        notes: lead.notes,
        // Лид мог быть заведён на уже зарегистрированного клиента -
        // тогда и контрагент сразу привязан к его кабинету
        userId: lead.userId,
      })
      .returning({ id: clients.id });

    await tx
      .update(crmLeads)
      .set({ clientId: created.id, status: "won" })
      .where(eq(crmLeads.id, leadId));

    await tx.insert(crmInteractions).values({
      leadId,
      type: "note",
      subject: "Лид превратился в контрагента",
      description: `Заведён контрагент № ${created.id}`,
      completedAt: new Date(),
      createdBy: Number(me.id),
    });

    return created.id;
  });

  await audit("crm.lead_converted", { type: "crm_lead", id: leadId }, { clientId });

  revalidatePath(`/admin/crm/${leadId}`);
  revalidatePath("/admin/crm");
  revalidatePath("/admin/counterparties");

  redirect(`/admin/external-orders/new?client=${clientId}`);
}
