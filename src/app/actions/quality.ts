"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  qcChecklists,
  qcChecklistItems,
  qcInspections,
  qcInspectionResults,
  qcDefects,
  productionOrders,
  productionOrderStages,
} from "@/db/schema";
import { currentUser } from "@/auth";
import { can } from "@/lib/permissions";
import { saveQcPhoto, removeUpload } from "@/lib/uploads";
import { QualityRuleError, checkDefectRefs, handleFailedInspection } from "@/lib/quality-db";
import { audit } from "@/lib/audit";
import {
  overallResult,
  isDefectClosed,
  QC_ITEM_STATUS,
  QC_SEVERITY,
  QC_DEFECT_STATUS,
  type QcItemStatus,
  type QcSeverity,
  type QcDefectStatus,
} from "@/lib/quality";
import { isKeyOf } from "@/lib/guards";
import { rejectOverlong } from "@/lib/text-limits";

export type QcState = { ok: boolean; message?: string };

const DENIED: QcState = { ok: false, message: "Нет прав на этот раздел" };

/**
 * Отдельного модуля прав у контроля качества нет: он часть производства,
 * и доступ к нему открыт тем же, кто ведёт заказы в цехе.
 */
async function mayInspect() {
  return can("orders", "edit");
}

// ------------------------------------------------------------ проверки

export async function createInspection(
  _prev: QcState,
  formData: FormData,
): Promise<QcState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayInspect())) return DENIED;

  const productionOrderId = Number(formData.get("productionOrderId"));
  const checklistId = Number(formData.get("checklistId"));
  const rawStage = String(formData.get("stageId") ?? "").trim();
  const stageId = rawStage === "" ? null : Number(rawStage);
  const summary = String(formData.get("summary") ?? "").trim();

  if (!Number.isInteger(productionOrderId) || !Number.isInteger(checklistId)) {
    return { ok: false, message: "Не выбраны заказ или чек-лист" };
  }

  const [order] = await db
    .select({ id: productionOrders.id })
    .from(productionOrders)
    .where(eq(productionOrders.id, productionOrderId))
    .limit(1);

  if (!order) return { ok: false, message: "Производственный заказ не найден" };

  // production_stage_id ссылается на строку production_order_stages -
  // этап конкретного заказа, а не на справочник этапов. Проверяем, что
  // этап принадлежит именно этому заказу: иначе внешний ключ пропустит
  // чужой номер, и проверка окажется привязана к чужому производству
  if (stageId !== null) {
    if (!Number.isInteger(stageId)) {
      return { ok: false, message: "Этап указан неверно" };
    }
    const [stage] = await db
      .select({ id: productionOrderStages.id })
      .from(productionOrderStages)
      .where(
        and(
          eq(productionOrderStages.id, stageId),
          eq(productionOrderStages.productionOrderId, productionOrderId),
        ),
      )
      .limit(1);

    if (!stage) return { ok: false, message: "Этап не относится к этому заказу" };
  }

  const items = await db
    .select({
      id: qcChecklistItems.id,
      critical: qcChecklistItems.isCritical,
    })
    .from(qcChecklistItems)
    .where(eq(qcChecklistItems.checklistId, checklistId))
    .orderBy(asc(qcChecklistItems.sortOrder), asc(qcChecklistItems.id));

  if (items.length === 0) {
    return { ok: false, message: "В чек-листе нет пунктов" };
  }

  // Отметки собираем по номерам пунктов самого чек-листа, а не по тому,
  // что пришло из формы: подменённый номер иначе попал бы в результаты
  const marks = items.map((item) => {
    const raw = String(formData.get(`status-${item.id}`) ?? "ok");
    const status = (isKeyOf(QC_ITEM_STATUS, raw) ? raw : "ok") as QcItemStatus;
    return {
      itemId: item.id,
      status,
      critical: item.critical === true,
      comment: String(formData.get(`comment-${item.id}`) ?? "").trim(),
    };
  });

  const result = overallResult(marks);

  // Брак: пауза в цехе и задача - в той же транзакции, что и сама
  // проверка. Иначе при сбое проверка записалась бы, а заказ пошёл дальше
  let paused = false;
  const inspectionId = await db.transaction(async (tx) => {
    const [inspection] = await tx
      .insert(qcInspections)
      .values({
        productionOrderId,
        productionStageId: stageId,
        checklistId,
        inspectorId: Number(user.id),
        result,
        summary: summary || null,
      })
      .returning({ id: qcInspections.id });

    await tx.insert(qcInspectionResults).values(
      marks.map((m) => ({
        inspectionId: inspection.id,
        checklistItemId: m.itemId,
        status: m.status,
        comment: m.comment || null,
      })),
    );

    if (result === "failed") {
      const handled = await handleFailedInspection(tx, {
        productionOrderId,
        inspectionId: inspection.id,
        inspectorId: Number(user.id),
      });
      paused = handled.paused;
    }

    return inspection.id;
  });

  await audit("quality.inspection", { type: "qc_inspection", id: inspectionId }, {
    productionOrderId,
    result,
    paused,
  });

  revalidatePath("/admin/quality");
  revalidatePath(`/admin/quality/inspections/${inspectionId}`);
  if (result === "failed") {
    revalidatePath("/admin/production");
    revalidatePath("/admin/tasks");
  }

  const failed = marks.filter((m) => m.status === "fail").length;
  return {
    ok: true,
    message:
      result === "passed"
        ? "Проверка пройдена"
        : result === "failed"
          ? `Отмечено несоответствий: ${failed}. Итог - «брак»${paused ? ": производство приостановлено" : ""}, заведена задача на разбор`
          : `Отмечено несоответствий: ${failed}. Итог - «с замечаниями»`,
  };
}

// ------------------------------------------------------------- дефекты

export async function createDefect(
  _prev: QcState,
  formData: FormData,
): Promise<QcState> {
  const tooLong = rejectOverlong(formData);
  if (tooLong) return tooLong;

  const user = await currentUser();
  if (!user || !(await mayInspect())) return DENIED;

  const productionOrderId = Number(formData.get("productionOrderId"));
  const rawInspection = String(formData.get("inspectionId") ?? "").trim();
  const inspectionId = rawInspection === "" ? null : Number(rawInspection);

  const title = String(formData.get("title") ?? "").trim().slice(0, 255);
  const description = String(formData.get("description") ?? "").trim();
  const rawSeverity = String(formData.get("severity") ?? "major");
  const severity = (isKeyOf(QC_SEVERITY, rawSeverity) ? rawSeverity : "major") as QcSeverity;

  if (!Number.isInteger(productionOrderId) || productionOrderId <= 0) {
    return { ok: false, message: "Не указан производственный заказ" };
  }
  if (inspectionId !== null && (!Number.isInteger(inspectionId) || inspectionId <= 0)) {
    return { ok: false, message: "Проверка указана неверно" };
  }
  if (title === "") return { ok: false, message: "Опишите дефект в одну строку" };

  // Ссылки проверяем до загрузки снимка: файл не должен лечь на диск, если
  // дефект всё равно не запишется
  try {
    await checkDefectRefs(db, productionOrderId, inspectionId);
  } catch (e) {
    if (e instanceof QualityRuleError) return { ok: false, message: e.message };
    throw e;
  }

  const photo = formData.get("photo");
  let photoPath: string | null = null;
  let savedName: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    try {
      const saved = await saveQcPhoto(photo);
      savedName = saved.filename;
      // В базе лежит путь относительно хранилища: так по нему сразу видно,
      // из какой он папки
      photoPath = `qc/${saved.filename}`;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Снимок не сохранён" };
    }
  }

  let defectId: number;
  try {
    const [created] = await db
      .insert(qcDefects)
      .values({
        inspectionId,
        productionOrderId,
        severity,
        title,
        description: description || null,
        photoPath,
        reportedBy: Number(user.id),
      })
      .returning({ id: qcDefects.id });
    defectId = created.id;
  } catch {
    // Запись не легла - снимок остался бы сиротой в хранилище
    if (savedName) await removeUpload(savedName, "qc");
    return { ok: false, message: "Не удалось записать дефект. Попробуйте ещё раз" };
  }

  await audit("quality.defect", { type: "qc_defect", id: defectId }, {
    productionOrderId,
    severity,
  });

  revalidatePath("/admin/quality");
  revalidatePath("/admin/quality/defects");
  return { ok: true, message: "Дефект зарегистрирован" };
}

export async function updateDefectStatus(
  _prev: QcState,
  formData: FormData,
): Promise<QcState> {
  const user = await currentUser();
  if (!user || !(await mayInspect())) return DENIED;

  const defectId = Number(formData.get("defectId"));
  const raw = String(formData.get("status") ?? "");

  if (!Number.isInteger(defectId)) return { ok: false, message: "Дефект не найден" };
  if (!isKeyOf(QC_DEFECT_STATUS, raw)) return { ok: false, message: "Неизвестный статус" };

  const status = raw as QcDefectStatus;
  const closing = isDefectClosed(status);

  const updated = await db
    .update(qcDefects)
    .set({
      status,
      // Кто и когда закрыл - записываем только при закрытии; при возврате
      // в работу отметку снимаем, иначе она соврёт на следующем круге
      fixedBy: closing ? Number(user.id) : null,
      fixedAt: closing ? new Date() : null,
    })
    .where(eq(qcDefects.id, defectId))
    .returning({ id: qcDefects.id });

  if (updated.length === 0) return { ok: false, message: "Дефект не найден" };

  await audit("quality.defect_status", { type: "qc_defect", id: defectId }, { status });

  revalidatePath("/admin/quality");
  revalidatePath("/admin/quality/defects");
  return { ok: true, message: `Статус: ${QC_DEFECT_STATUS[status].label.toLowerCase()}` };
}

export async function deleteDefect(_prev: QcState, formData: FormData): Promise<QcState> {
  if (!(await can("orders", "delete"))) return DENIED;

  const defectId = Number(formData.get("defectId"));
  if (!Number.isInteger(defectId)) return { ok: false, message: "Дефект не найден" };

  const [row] = await db
    .select({ photoPath: qcDefects.photoPath })
    .from(qcDefects)
    .where(eq(qcDefects.id, defectId))
    .limit(1);

  if (!row) return { ok: false, message: "Дефект не найден" };

  await db.delete(qcDefects).where(eq(qcDefects.id, defectId));

  if (row.photoPath?.startsWith("qc/")) {
    await removeUpload(row.photoPath.slice(3), "qc");
  }

  await audit("quality.defect_delete", { type: "qc_defect", id: defectId });

  revalidatePath("/admin/quality/defects");
  return { ok: true, message: "Дефект удалён" };
}

// ----------------------------------------------------------- чек-листы

export async function saveChecklistItem(
  _prev: QcState,
  formData: FormData,
): Promise<QcState> {
  const tooLong = rejectOverlong(formData, { text: 500 });
  if (tooLong) return tooLong;

  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Менять чек-листы может администратор" };
  }

  const checklistId = Number(formData.get("checklistId"));
  const rawId = String(formData.get("itemId") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim().slice(0, 500);
  const description = String(formData.get("description") ?? "").trim();
  const isCritical = formData.get("isCritical") === "on";
  const sortOrder = Number(formData.get("sortOrder")) || 0;

  if (!Number.isInteger(checklistId)) return { ok: false, message: "Чек-лист не найден" };
  if (text === "") return { ok: false, message: "Впишите текст пункта" };

  const [checklist] = await db
    .select({ id: qcChecklists.id })
    .from(qcChecklists)
    .where(eq(qcChecklists.id, checklistId))
    .limit(1);

  if (!checklist) return { ok: false, message: "Чек-лист не найден" };

  let savedItemId: number;
  if (rawId === "") {
    const [created] = await db
      .insert(qcChecklistItems)
      .values({
        checklistId,
        text,
        description: description || null,
        isCritical,
        sortOrder,
      })
      .returning({ id: qcChecklistItems.id });
    savedItemId = created.id;
  } else {
    const itemId = Number(rawId);
    if (!Number.isInteger(itemId)) return { ok: false, message: "Пункт не найден" };

    const updated = await db
      .update(qcChecklistItems)
      .set({ text, description: description || null, isCritical, sortOrder })
      .where(
        and(eq(qcChecklistItems.id, itemId), eq(qcChecklistItems.checklistId, checklistId)),
      )
      .returning({ id: qcChecklistItems.id });

    if (updated.length === 0) return { ok: false, message: "Пункт не найден" };
    savedItemId = itemId;
  }

  await audit("quality.checklist_item_save", { type: "qc_checklist", id: checklistId }, {
    itemId: savedItemId,
    isCritical,
  });

  revalidatePath(`/admin/quality/checklists/${checklistId}`);
  revalidatePath("/admin/quality");
  return { ok: true, message: "Сохранено" };
}

export async function deleteChecklistItem(
  _prev: QcState,
  formData: FormData,
): Promise<QcState> {
  if (!(await can("settings", "edit"))) {
    return { ok: false, message: "Менять чек-листы может администратор" };
  }

  const itemId = Number(formData.get("itemId"));
  const checklistId = Number(formData.get("checklistId"));
  if (!Number.isInteger(itemId)) return { ok: false, message: "Пункт не найден" };

  // Пункт, по которому уже есть отметки, удалять нельзя: без него
  // прошедшие проверки перестанут читаться
  const [used] = await db
    .select({ id: qcInspectionResults.id })
    .from(qcInspectionResults)
    .where(eq(qcInspectionResults.checklistItemId, itemId))
    .limit(1);

  if (used) {
    return {
      ok: false,
      message: "По пункту уже есть проверки - его можно только переписать",
    };
  }

  await db.delete(qcChecklistItems).where(eq(qcChecklistItems.id, itemId));

  await audit(
    "quality.checklist_item_delete",
    { type: "qc_checklist", id: Number.isInteger(checklistId) ? checklistId : null },
    { itemId },
  );

  revalidatePath(`/admin/quality/checklists/${checklistId}`);
  return { ok: true, message: "Пункт удалён" };
}
