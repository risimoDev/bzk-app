import QRCode from "qrcode";

/**
 * Платёжный QR-код по ГОСТ Р 56042-2014.
 *
 * Такой код читают банковские приложения: клиент наводит камеру и
 * получает уже заполненную платёжку. На старом сайте QR был обещан в
 * тексте страницы оплаты, но нигде не генерировался - библиотека
 * phpqrcode лежала в репозитории обрезанной и не работала.
 *
 * Структура строки: «ST00012» + разделитель + пары «Ключ=Значение».
 * Здесь ST - признак формата, 0001 - версия, 2 - кодировка UTF-8.
 * Разделителем служит первый символ после заголовка.
 */

const SEPARATOR = "|";

export type PaymentQrInput = {
  /** Получатель - как в банке */
  name: string;
  /** Расчётный счёт, 20 цифр */
  personalAcc: string;
  bankName: string;
  /** БИК, 9 цифр */
  bic: string;
  /** Корреспондентский счёт, 20 цифр */
  correspAcc: string;
  payeeInn: string;
  kpp?: string;
  /** Сумма в рублях; в код уходит в копейках */
  sum: number;
  purpose: string;
  payerName?: string;
  /** Номер документа-основания, попадает в дополнительные реквизиты */
  docNo?: string;
};

/**
 * Назначение платежа ограничено 210 символами - столько влезает в поле
 * платёжного поручения. Режем по границе слова, чтобы не обрывать на
 * середине.
 */
function trimPurpose(text: string, limit = 210) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

/** Строка, которая кодируется в QR. */
export function buildPaymentQrPayload(input: PaymentQrInput): string {
  const digits = (s: string) => s.replace(/\D/g, "");

  const fields: [string, string][] = [
    ["Name", input.name.trim()],
    ["PersonalAcc", digits(input.personalAcc)],
    ["BankName", input.bankName.trim()],
    ["BIC", digits(input.bic)],
    ["CorrespAcc", digits(input.correspAcc)],
    // Сумма в копейках и без дробной части - так требует формат
    ["Sum", String(Math.round(input.sum * 100))],
    ["Purpose", trimPurpose(input.purpose)],
    ["PayeeINN", digits(input.payeeInn)],
  ];

  if (input.kpp) fields.push(["KPP", digits(input.kpp)]);
  if (input.payerName) fields.push(["LastName", input.payerName.trim()]);
  if (input.docNo) fields.push(["DocNo", input.docNo.trim()]);

  // Значение не может содержать разделитель - иначе распадётся разбор
  const body = fields
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${v.split(SEPARATOR).join("/")}`)
    .join(SEPARATOR);

  return `ST00012${SEPARATOR}${body}`;
}

/**
 * SVG платёжного кода. Именно SVG: он не мылится при печати документа
 * и не тянет за собой отдельный файл - вставляется прямо в разметку.
 */
export async function paymentQrSvg(input: PaymentQrInput, size = 160) {
  const payload = buildPaymentQrPayload(input);
  return QRCode.toString(payload, {
    type: "svg",
    // M выдерживает загрязнение и перегиб бумаги, но не раздувает код
    errorCorrectionLevel: "M",
    margin: 0,
    width: size,
    color: { dark: "#000000", light: "#0000" },
  });
}

/** QR с произвольным содержимым - для ссылок на заказ и отслеживание. */
export async function textQrSvg(text: string, size = 120) {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: size,
    color: { dark: "#000000", light: "#0000" },
  });
}
