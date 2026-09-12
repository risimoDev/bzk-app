/**
 * Отсев одноразовой почты при регистрации.
 *
 * На старом сайте это делал `isDisposableEmail()` по списку из 60 тысяч
 * доменов (includes/disposable_domains.json, 1.3 МБ). Тащить весь список
 * в бандл ради этого не будем: 99% спама идёт с десятка сервисов, а
 * длинный список бьёт по холодному старту и почти ничего не добавляет.
 * Если понадобится, полный список можно подгрузить из файла на сервере.
 *
 * Проверка мягкая: сомнительный домен отклоняем, но честному человеку с
 * непопулярной почтой мешать не хотим - поэтому список короткий и явный.
 *
 * Файл без базы и без next - его подключают и форма, и проверочный скрипт.
 */

/** Самые ходовые сервисы одноразовой почты. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.biz",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "yopmail.com",
  "yopmail.fr",
  "dispostable.com",
  "trashmail.com",
  "trashmail.de",
  "mailnesia.com",
  "fakeinbox.com",
  "spamgourmet.com",
  "mohmal.com",
  "emailondeck.com",
  "mail-temp.com",
  "temp-mail.io",
  "mailcatch.com",
  "mvrht.com",
  "moakt.com",
  "tmail.ws",
  "dropmail.me",
  "vomoto.com",
  "0-mail.com",
  "burnermail.io",
]);

/** Домен из адреса, в нижнем регистре. `null`, если адрес непохож на почту. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Одноразовый ли адрес. Проверяем и сам домен, и его родителя: сервисы
 * раздают почту на поддоменах вида `inbox.mailinator.com`.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Похоже на одноразовую почту - укажите постоянный адрес";
