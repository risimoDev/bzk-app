/**
 * Контроль качества: чек-листы, проверки, дефекты.
 *
 * Перенесено из includes/services/QualityControlService.php. Только
 * словари и правила - обращения к базе живут в серверных действиях и на
 * страницах, потому что этот файл подключают клиентские формы.
 */

export const QC_RESULT = {
  passed: { label: "Принято", className: "bg-ok/15 text-ok" },
  partial: { label: "С замечаниями", className: "bg-warn/15 text-warn" },
  failed: { label: "Брак", className: "bg-danger/12 text-danger" },
} as const;

export type QcResult = keyof typeof QC_RESULT;

export function qcResult(value: string | null) {
  return QC_RESULT[(value ?? "passed") as QcResult] ?? QC_RESULT.passed;
}

export const QC_ITEM_STATUS = {
  ok: { label: "Норма", className: "bg-ok/15 text-ok" },
  fail: { label: "Не соответствует", className: "bg-danger/12 text-danger" },
  na: { label: "Не применимо", className: "bg-ink/10 text-ink/50" },
} as const;

export type QcItemStatus = keyof typeof QC_ITEM_STATUS;

export const QC_SEVERITY = {
  minor: { label: "Мелкий", className: "bg-ink/10 text-ink/60" },
  major: { label: "Существенный", className: "bg-warn/15 text-warn" },
  critical: { label: "Критический", className: "bg-danger/12 text-danger" },
} as const;

export type QcSeverity = keyof typeof QC_SEVERITY;

export function qcSeverity(value: string | null) {
  return QC_SEVERITY[(value ?? "major") as QcSeverity] ?? QC_SEVERITY.major;
}

export const QC_DEFECT_STATUS = {
  open: { label: "Открыт", className: "bg-danger/12 text-danger" },
  in_fix: { label: "Исправляется", className: "bg-warn/15 text-warn" },
  fixed: { label: "Исправлен", className: "bg-ok/15 text-ok" },
  wont_fix: { label: "Не исправляем", className: "bg-ink/10 text-ink/50" },
} as const;

export type QcDefectStatus = keyof typeof QC_DEFECT_STATUS;

export function qcDefectStatus(value: string | null) {
  return QC_DEFECT_STATUS[(value ?? "open") as QcDefectStatus] ?? QC_DEFECT_STATUS.open;
}

/** Дефект закрыт - дальнейшая смена статуса ничего не даёт. */
export function isDefectClosed(status: string | null) {
  return status === "fixed" || status === "wont_fix";
}

/**
 * Итог проверки по отметкам её пунктов.
 *
 * Провал критического пункта - брак: такую партию нельзя отгружать.
 * Провал обычного - замечания: изделие годится, но что-то надо
 * поправить. Пункт «не применимо» на итог не влияет.
 */
export function overallResult(
  marks: { status: QcItemStatus; critical: boolean }[],
): QcResult {
  let hasFail = false;

  for (const m of marks) {
    if (m.status !== "fail") continue;
    if (m.critical) return "failed";
    hasFail = true;
  }

  return hasFail ? "partial" : "passed";
}

/** Доля принятых проверок в процентах. */
export function passRate(passed: number, total: number) {
  return total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
}

/** Форматы фотоотчёта по дефекту. */
export const QC_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const QC_PHOTO_ACCEPT = QC_PHOTO_EXTENSIONS.map((e) => `.${e}`).join(",");
/**
 * Фото уходит серверным действием, а у действий общий потолок тела 10 МБ
 * (serverActions.bodySizeLimit в next.config.ts) - снимок плюс служебные
 * байты формы должны в него влезать.
 */
export const MAX_QC_PHOTO_SIZE = 8 * 1024 * 1024;
