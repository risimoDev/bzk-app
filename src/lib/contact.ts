/**
 * Форма обратной связи: словарь способов связи.
 *
 * Лежит отдельно от действия, потому что подписи нужны и на витрине
 * (клиентский компонент формы), и в админке, и в уведомлении.
 */

export const PREFERRED_CONTACT = {
  email: "Почта",
  phone: "Телефон",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
} as const;

export type PreferredContact = keyof typeof PREFERRED_CONTACT;

export function preferredContactLabel(value: string | null) {
  return PREFERRED_CONTACT[(value ?? "email") as PreferredContact] ?? "Почта";
}
