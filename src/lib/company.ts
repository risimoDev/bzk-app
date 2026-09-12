/**
 * Реквизиты продавца.
 *
 * В старом сайте они были зашиты прямо в шаблон УПД, причём заглушкой:
 * «ИП Иванов Иван Иванович», ИНН 123456789012, «г. Москва, ул. Примерная».
 * Ни один документ с такими данными не годится, поэтому реквизиты
 * переехали в таблицу settings - тот же ключ-значение, что и налоговая
 * ставка, - и заполняются в админке.
 *
 * Здесь только описание полей и проверки: файл подключает клиентская
 * форма, поэтому обращение к базе вынесено в company-db.ts.
 */

export const COMPANY_FIELDS = {
  company_name: "Полное наименование",
  company_short_name: "Краткое наименование",
  company_inn: "ИНН",
  company_kpp: "КПП",
  company_ogrn: "ОГРН / ОГРНИП",
  company_address: "Юридический адрес",
  company_phone: "Телефон",
  company_email: "E-mail",
  company_director: "Руководитель (Ф.И.О.)",
  company_accountant: "Главный бухгалтер (Ф.И.О.)",
  company_bank_name: "Банк",
  company_bank_bic: "БИК",
  company_bank_account: "Расчётный счёт",
  company_bank_corr_account: "Корреспондентский счёт",
} as const;

export type CompanyField = keyof typeof COMPANY_FIELDS;
export type Company = Record<CompanyField, string>;

/** Подсказки к полям - что именно вписывать и как это проверяется. */
export const COMPANY_HINTS: Partial<Record<CompanyField, string>> = {
  company_name: "Как в ЕГРИП/ЕГРЮЛ: «Индивидуальный предприниматель Кобелев Лев Алексеевич»",
  company_short_name: "Короткая форма для шапки счёта: «ИП Кобелев Л. А.»",
  company_inn: "12 цифр у ИП, 10 у юрлица",
  company_kpp: "Только у юрлиц - у ИП поле остаётся пустым",
  company_bank_bic: "9 цифр",
  company_bank_account: "20 цифр",
  company_bank_corr_account: "20 цифр",
  company_accountant: "У ИП без бухгалтера оставьте пустым - строка в документе не появится",
};

export const EMPTY_COMPANY: Company = Object.fromEntries(
  Object.keys(COMPANY_FIELDS).map((k) => [k, ""]),
) as Company;

/** Поля, без которых документ выпускать нельзя. */
export const REQUIRED_FOR_DOCUMENTS: CompanyField[] = [
  "company_name",
  "company_inn",
  "company_address",
  "company_director",
];

/** Дополнительно нужны для платёжного QR-кода. */
export const REQUIRED_FOR_QR: CompanyField[] = [
  "company_name",
  "company_inn",
  "company_bank_name",
  "company_bank_bic",
  "company_bank_account",
  "company_bank_corr_account",
];

export function missingFields(company: Company, required: CompanyField[]) {
  return required.filter((f) => !company[f].trim());
}

/**
 * Проверки формата. Возвращает список замечаний, а не бросает: реквизиты
 * можно сохранять частями, а предупреждение видно рядом с полем.
 */
export function validateCompany(company: Company): Partial<Record<CompanyField, string>> {
  const out: Partial<Record<CompanyField, string>> = {};
  const digits = (s: string) => s.replace(/\D/g, "");

  const inn = digits(company.company_inn);
  if (inn && inn.length !== 10 && inn.length !== 12) {
    out.company_inn = "ИНН должен быть из 10 или 12 цифр";
  }
  const kpp = digits(company.company_kpp);
  if (kpp && kpp.length !== 9) out.company_kpp = "КПП - 9 цифр";
  if (kpp && inn.length === 12) out.company_kpp = "У ИП КПП не бывает";

  const bic = digits(company.company_bank_bic);
  if (bic && bic.length !== 9) out.company_bank_bic = "БИК - 9 цифр";

  for (const f of ["company_bank_account", "company_bank_corr_account"] as const) {
    const acc = digits(company[f]);
    if (acc && acc.length !== 20) out[f] = "Счёт - 20 цифр";
  }

  const email = company.company_email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    out.company_email = "Похоже на опечатку в адресе";
  }

  return out;
}
