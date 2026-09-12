/**
 * Перевод уведомления из телеграма в письмо.
 *
 * Тексты уведомлений пишутся один раз - в разметке телеграма: `<b>`,
 * переносы строк и уже экранированные значения. Писать второй экземпляр
 * под почту значило бы рано или поздно развести их. Поэтому письмо
 * собирается из того же текста: для простой части теги снимаются, для
 * HTML-части переносы превращаются в `<br>`.
 *
 * Здесь нет ни базы, ни почты - файл проверяется скриптом под голым node.
 */

export type NotifyLink = { text: string; url: string };

/** Сущности, которые умеет выдавать `esc()` из lib/telegram. */
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&amp;": "&",
};

/** Простой текст письма: без тегов, с раскрытыми сущностями и ссылками внизу. */
export function notificationText(telegramHtml: string, links: NotifyLink[] = []) {
  const body = telegramHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // &amp; раскрываем последним: иначе «&amp;lt;» превратится в «<»
    .replace(/&(lt|gt|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/&amp;/g, "&");

  const tail = links.map((l) => `${l.text}: ${l.url}`).join("\n");
  return tail ? `${body}\n\n${tail}` : body;
}

/**
 * HTML-часть письма.
 *
 * Разметку телеграма пропускаем как есть - в ней только `<b>`, `<i>` и
 * значения, прошедшие `esc()`. Остальные теги срезаем: письмо читают
 * почтовые клиенты, и лишнее там только навредит.
 */
export function notificationHtml(telegramHtml: string, links: NotifyLink[] = []) {
  const body = telegramHtml
    .replace(/<(?!\/?(b|i|u|s)>)[^>]+>/gi, "")
    .replace(/\n/g, "<br>");

  const buttons = links
    .map(
      (l) =>
        `<p style="margin:20px 0 0"><a href="${escapeAttr(l.url)}" ` +
        `style="display:inline-block;padding:10px 18px;border-radius:999px;` +
        `background:#2f7d74;color:#fff;text-decoration:none;font-weight:600">` +
        `${escapeAttr(l.text)}</a></p>`,
    )
    .join("");

  return (
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0e1417">` +
    `<p style="margin:0">${body}</p>${buttons}` +
    `<p style="margin:28px 0 0;font-size:12px;color:#6b7478">` +
    `БЗК Принт. Письмо пришло, потому что в профиле включены уведомления на почту - ` +
    `отключить их можно в личном кабинете, в разделе «Профиль».</p></div>`
  );
}

function escapeAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
