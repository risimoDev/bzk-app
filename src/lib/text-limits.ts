/**
 * Предельная длина текстовых полей форм.
 *
 * Без предела в серверное действие можно положить мегабайты в «сообщение»:
 * они пройдут в text-колонку, раздуют базу, уйдут письмом и телеграмом
 * и потом будут отдаваться в каждой выборке. А поле на varchar без
 * проверки упадёт в базе ошибкой 500 вместо подсказки человеку.
 *
 * Предел задан по имени поля формы - одним словарём, чтобы «имя» везде
 * было 255 (varchar в схеме), «адрес» 1000, а свободный текст 5000. Там,
 * где колонка короче, действие передаёт свой предел вторым аргументом
 * (телефон в профиле - 20, текст напоминания - 500).
 *
 * Модуль чистый: ни базы, ни Next. Его подключают и серверные действия,
 * и проверочные скрипты.
 */

/** Короткое строковое поле: varchar(255) в схеме. */
export const LIMIT_SHORT = 255;
/** Телефон: varchar(50) (у профиля клиента - 20, там своё). */
export const LIMIT_PHONE = 50;
/** Адрес и прочий короткий абзац. */
export const LIMIT_ADDRESS = 1000;
/** Свободный текст: сообщение, описание, комментарий. */
export const LIMIT_TEXT = 5000;
/** Документ целиком: HTML шаблона, схема полей. Больше текста, но не бесконечно. */
export const LIMIT_DOCUMENT = 100_000;

const BY_NAME: Record<string, number> = {
  // varchar(255) в схеме
  name: LIMIT_SHORT,
  title: LIMIT_SHORT,
  subject: LIMIT_SHORT,
  email: LIMIT_SHORT,
  company: LIMIT_SHORT,
  companyName: LIMIT_SHORT,
  clientName: LIMIT_SHORT,
  clientCompany: LIMIT_SHORT,
  clientEmail: LIMIT_SHORT,
  contactPerson: LIMIT_SHORT,
  supplier: LIMIT_SHORT,
  itemName: LIMIT_SHORT,
  adjustmentNote: LIMIT_SHORT,
  paymentTerms: LIMIT_SHORT,
  deliveryTerms: LIMIT_SHORT,
  website: LIMIT_SHORT,
  key: LIMIT_SHORT,
  value: LIMIT_SHORT,
  customerCode: 50,

  phone: LIMIT_PHONE,
  clientPhone: LIMIT_PHONE,

  address: LIMIT_ADDRESS,
  shippingAddress: LIMIT_ADDRESS,
  legalAddress: LIMIT_ADDRESS,
  clientAddress: LIMIT_ADDRESS,

  tags: 500,
  unit: 50,
  itemUnit: 50,
  code: 80,
  promoCode: 80,
  numberPrefix: 20,
  documentNumber: 50,
  inn: 32,
  kpp: 32,
  totp: 32,
  token: 512,
  password: 256,
  passwordConfirm: 256,
  currentPassword: 256,

  // Крупные тела: HTML шаблона документа, схема полей
  content: LIMIT_DOCUMENT,
  contentTemplate: LIMIT_DOCUMENT,
  fieldsSchema: LIMIT_DOCUMENT,
  items: LIMIT_DOCUMENT,
  ids: 4000,
  "cf-turnstile-response": 4096,
  loginChallenge: 1024,
};

/** Числа, даты, id и флаги - короткие по природе, 5000 знаков в них не нужны. */
const COMPACT_CASE = /(^id$|Id$|Ids$|At$)/;
const COMPACT_WORD = /(qty|quantity|amount|price|cost|percent|days|hours|minutes|mm|date|limit|modifier|stock|multiplicity|expense|adjustment|order|value|until)$/i;
const COMPACT_LIMIT = 64;

/** Поля-перечисления: значение из короткого словаря, длинное - заведомо подбор. */
const ENUM_FIELDS = new Set([
  "status", "type", "priority", "category", "kind", "source", "direction", "severity",
  "docType", "discountType", "productionStatus", "preferredContact", "materialType",
  "clientMode", "paidNow", "page", "action", "won", "hold", "resolved",
  "completed", "closed", "archived", "active", "blocked", "visible", "pending", "new",
  "urgent", "isUrgent",
]);

/** Подписи полей для сообщения об ошибке. Неизвестное поле - без подписи. */
const LABELS: Record<string, string> = {
  name: "Имя",
  title: "Заголовок",
  subject: "Тема",
  email: "Почта",
  phone: "Телефон",
  message: "Сообщение",
  description: "Описание",
  comment: "Комментарий",
  notes: "Заметки",
  note: "Примечание",
  reason: "Причина",
  text: "Текст",
  summary: "Итог",
  result: "Результат",
  lossReason: "Причина отказа",
  address: "Адрес",
  shippingAddress: "Адрес доставки",
  legalAddress: "Юридический адрес",
  companyName: "Название компании",
  company: "Компания",
  tags: "Теги",
  adjustmentNote: "Пояснение к корректировке",
  paymentTerms: "Условия оплаты",
  deliveryTerms: "Условия доставки",
};

/** Имя поля без числового хвоста: «comment-12» → «comment». */
function baseName(name: string): string {
  return name.replace(/[-_]\d+$/, "").replace(/\[\d*\]$/, "");
}

/** Предел длины для поля формы: свой из overrides, из словаря или общий для текста. */
export function limitFor(name: string, overrides?: Record<string, number>): number {
  if (overrides && Object.hasOwn(overrides, name)) return overrides[name];
  const base = baseName(name);
  if (overrides && Object.hasOwn(overrides, base)) return overrides[base];
  if (Object.hasOwn(BY_NAME, base)) return BY_NAME[base];
  if (ENUM_FIELDS.has(base)) return COMPACT_LIMIT;
  if (COMPACT_CASE.test(base) || COMPACT_WORD.test(base)) return COMPACT_LIMIT;
  return LIMIT_TEXT;
}

/**
 * Поля формы, не влезающие в предел: имя поля → подсказка. Пустой объект,
 * если всё в порядке. Файлы пропускаются: у них свои правила.
 */
export function overlongFields(
  formData: FormData,
  overrides?: Record<string, number>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    // Скрытые служебные поля Next ($ACTION_ID_...) не наши
    if (name.startsWith("$ACTION")) continue;
    const limit = limitFor(name, overrides);
    const length = value.trim().length;
    if (length <= limit) continue;
    if (Object.hasOwn(errors, name)) continue;
    const label = Object.hasOwn(LABELS, baseName(name)) ? LABELS[baseName(name)] : null;
    errors[name] = `${label ? `«${label}»: не` : "Не"} длиннее ${limit} знаков, сейчас ${length}`;
  }
  return errors;
}

/** Ответ действия, когда поле слишком длинное: годится любому из наших состояний формы. */
export type OverlongRejection = {
  ok: false;
  message: string;
  error: string;
  fieldErrors: Record<string, string>;
};

/**
 * Первая строка серверного действия после проверки прав:
 *
 *   const tooLong = rejectOverlong(formData);
 *   if (tooLong) return tooLong;
 *
 * Возвращает готовое состояние формы или null. message и error совпадают -
 * у разных форм читается то или другое поле.
 */
export function rejectOverlong(
  formData: FormData,
  overrides?: Record<string, number>,
): OverlongRejection | null {
  const fieldErrors = overlongFields(formData, overrides);
  const names = Object.keys(fieldErrors);
  if (names.length === 0) return null;

  const text =
    names.length === 1
      ? fieldErrors[names[0]]
      : `Слишком длинный текст в полях: ${names.length}. ${fieldErrors[names[0]]}`;
  return { ok: false, message: text, error: text, fieldErrors };
}
