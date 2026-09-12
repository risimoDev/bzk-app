/**
 * Проверка писем-уведомлений.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-notify-format.mjs
 *
 * Письмо собирается из того же текста, что уходит в телеграм. В тексте
 * бывают данные клиента - имя, сообщение по заказу, - поэтому проверяем
 * две вещи: в простой части нет тегов и видны настоящие символы, а в
 * HTML-части не проходит ничего, кроме выделения, и ссылку нельзя
 * превратить в разметку.
 */
import { notificationHtml, notificationText } from "../src/lib/notify-format.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

// Так выглядит текст после esc() из lib/telegram
const tg = "<b>Сообщение по заказу № 17</b>\nАнна: цена &lt;10 000&gt; &amp; срок &quot;завтра&quot;";
const links = [{ text: "Ответить", url: "https://bzkprint.ru/client/orders/17" }];

// ------------------------------------------------------- простой текст

const text = notificationText(tg, links);
check("теги сняты", !/<\/?b>/.test(text), text);
check("сущности раскрыты", text.includes('цена <10 000> & срок "завтра"'), text);
check("ссылка дописана внизу", text.endsWith("Ответить: https://bzkprint.ru/client/orders/17"));
check("двойное экранирование не раскрывается дважды", notificationText("&amp;lt;") === "&lt;");

// ------------------------------------------------------------- HTML

const html = notificationHtml(tg, links);
check("выделение сохранено", html.includes("<b>Сообщение по заказу № 17</b>"));
check("переносы стали <br>", html.includes("</b><br>Анна"));
check("экранированный текст так и остался экранированным", html.includes("&lt;10 000&gt;"));

const hostile = notificationHtml('<b>ok</b><script>alert(1)</script><a href="x">y</a><img src=x onerror=1>');
check("скрипт вырезан", !hostile.includes("<script"), hostile);
check("ссылки из текста вырезаны", !hostile.includes('<a href="x"'), hostile);
check("картинка вырезана", !hostile.includes("<img"), hostile);

const trap = notificationHtml("x", [{ text: '"><script>alert(1)</script>', url: 'https://a.ru/"onmouseover="1' }]);
check("кавычка в адресе не закрывает атрибут", !trap.includes('"onmouseover="'), trap);
check("подпись кнопки экранирована", trap.includes("&quot;&gt;&lt;script&gt;"), trap);

check("внизу объяснено, как отписаться", html.includes("отключить их можно в личном кабинете"));

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
