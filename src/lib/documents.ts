import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Документооборот: статусы, типы и безопасный показ содержимого.
 *
 * Тело документа хранится в базе готовым HTML - так его сложил старый
 * редактор шаблонов. Печатать такую строку без разбора нельзя: в неё
 * подставляются данные клиента, а значит через название компании или
 * комментарий туда может попасть что угодно. Поэтому перед показом HTML
 * проходит через белый список тегов.
 */

// Подписи живут в documents-meta.ts и переэкспортируются отсюда: их
// импортируют и страницы, и клиентские формы, а этот файл server-only
export {
  DOC_STATUS,
  DOC_TYPE,
  DOC_ACTIONS,
  docStatus,
  docType,
  type DocStatus,
} from "./documents-meta";

/**
 * Тело документа, пригодное для вставки в страницу.
 *
 * Разрешены только теги вёрстки таблиц и текста плюс инлайновые стили -
 * на них держится разметка старых шаблонов. Скрипты, ссылки, картинки и
 * обработчики событий вырезаются.
 */
export function safeDocumentHtml(content: string | null): string {
  if (!content) return "";

  return sanitizeHtml(content, {
    allowedTags: [
      "div", "span", "p", "br", "hr",
      "b", "strong", "i", "em", "u", "s", "sub", "sup", "small",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "blockquote", "pre", "code",
    ],
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
      colgroup: ["span"],
    },
    // url() в стилях умеет утекать наружу - за картинками фона следим отдельно
    allowedStyles: {
      "*": {
        "color": [/^[^;{}()]*$/],
        "background": [/^(?!.*url\()[^;{}]*$/i],
        "background-color": [/^[^;{}()]*$/],
        "font-size": [/^[\d.]+(px|pt|em|rem|%)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-family": [/^[^;{}()]*$/],
        "font-style": [/^(normal|italic)$/],
        "text-align": [/^(left|right|center|justify)$/],
        "text-decoration": [/^[^;{}()]*$/],
        "vertical-align": [/^(top|middle|bottom|baseline)$/],
        "border": [/^[^;{}()]*$/],
        "border-collapse": [/^(collapse|separate)$/],
        "border-top": [/^[^;{}()]*$/],
        "border-bottom": [/^[^;{}()]*$/],
        "border-left": [/^[^;{}()]*$/],
        "border-right": [/^[^;{}()]*$/],
        "padding": [/^[\d.\s]+(px|pt|mm|em|%)?$/],
        "margin": [/^[-\d.\s]+(px|pt|mm|em|%)?$/],
        "margin-top": [/^[-\d.]+(px|pt|mm|em|%)$/],
        "margin-bottom": [/^[-\d.]+(px|pt|mm|em|%)$/],
        "width": [/^[\d.]+(px|pt|mm|em|%)$/],
        "height": [/^[\d.]+(px|pt|mm|em|%)$/],
        "line-height": [/^[\d.]+(px|pt|em|%)?$/],
        "white-space": [/^(normal|nowrap|pre|pre-wrap)$/],
      },
    },
    // <style> внутри документа задаёт рамки таблиц - оставляем, но без
    // содержимого, способного вылезти за пределы блока документа
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  });
}
