/**
 * Заполняет реквизиты продавца в таблице settings.
 *
 *   node scripts/seed-company.mjs
 *
 * Данные не выдуманы: они уже лежали в базе - в значениях по умолчанию
 * шаблонов документов (document_templates.fields_schema). Раньше каждый
 * шаблон хранил свою копию, поэтому реквизиты расходились между счётом,
 * актом и договором. Теперь источник один.
 *
 * Скрипт идемпотентен и не затирает то, что уже заполнено в админке:
 * пишутся только отсутствующие или пустые ключи.
 */
import pg from "pg";
import { databaseUrl } from "./db-url.mjs";

const url = databaseUrl();

const VALUES = {
  company_name: "ИП Кобелев Лев Алексеевич",
  company_short_name: "ИП Кобелев Л. А.",
  company_inn: "590584223112",
  // КПП у индивидуального предпринимателя не бывает
  company_kpp: "",
  company_ogrn: "",
  company_address: "614065, Россия, Пермский край, г. Пермь, ул. Энергетиков, д. 9",
  company_phone: "+7 922 304-04-65",
  company_email: "bzkprint@yandex.ru",
  company_director: "Кобелев Л. А.",
  company_accountant: "",
  company_bank_name: 'ООО "Банк Точка"',
  company_bank_bic: "044525104",
  company_bank_account: "40802810420000400257",
  company_bank_corr_account: "30101810745374525104",
};

const client = new pg.Client({ connectionString: url });
await client.connect();

let added = 0;
let kept = 0;

for (const [name, value] of Object.entries(VALUES)) {
  const { rows } = await client.query("SELECT value FROM settings WHERE name = $1", [name]);

  if (rows.length > 0 && String(rows[0].value).trim() !== "") {
    kept++;
    continue;
  }

  await client.query(
    `INSERT INTO settings (name, value) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`,
    [name, value],
  );
  added++;
  console.log(`  + ${name} = ${value || "(пусто)"}`);
}

console.log(`\nЗаписано ключей: ${added}, оставлено без изменений: ${kept}`);
await client.end();
