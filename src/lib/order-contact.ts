/**
 * Разбор поля orders.contact_info.
 *
 * В старом сайте туда клали не строку, а JSON: контакты клиента на момент
 * заказа плюс детали расчёта - надбавку за срочность и данные промокода.
 * Без разбора поле выводилось сырым JSON с экранированной кириллицей.
 */
export type OrderContact = {
  name?: string;
  email?: string;
  phone?: string;
  comment?: string;
  isUrgent?: boolean;
  originalTotal?: number;
  urgentFee?: number;
  promo?: unknown;
  /**
   * Реквизиты покупателя на момент заказа. Есть только у заказов,
   * оформленных после появления снимка; у остальных - undefined, и
   * документы берут текущие данные профиля.
   */
  buyer?: {
    isCorporate: boolean;
    companyName?: string;
    inn?: string;
    kpp?: string;
    legalAddress?: string;
  };
  /** Текст как есть - если это оказался не JSON */
  raw?: string;
};

export function parseContact(value: string | null): OrderContact | null {
  if (!value) return null;

  const text = value.trim();
  if (!text.startsWith("{")) return { raw: text };

  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

    return {
      name: str(j.name),
      email: str(j.email),
      phone: str(j.phone),
      comment: str(j.comment),
      isUrgent: j.is_urgent === true,
      originalTotal: num(j.original_total_price),
      urgentFee: num(j.urgent_fee),
      promo: j.promo_data ?? undefined,
      buyer:
        typeof j.is_corporate === "boolean"
          ? {
              isCorporate: j.is_corporate,
              companyName: str(j.company_name),
              inn: str(j.inn),
              kpp: str(j.kpp),
              legalAddress: str(j.legal_address),
            }
          : undefined,
    };
  } catch {
    // Не JSON - показываем как обычный текст, это тоже валидный случай
    return { raw: text };
  }
}
