/**
 * Проверка подсказки реквизитов по ИНН.
 *
 *   npm run check:inn
 *
 * Сети и ключа DaData не нужно: контрольная сумма ИНН и разбор ответа
 * проверяются на фикстурах (формат - документация DaData, findById/party),
 * а правила маршрута (404 без ключа, вход, лимиты, таймаут, молчание о
 * причинах сбоя) закреплены по тексту исходников, чтобы их не снесли
 * правкой «заодно».
 */
import fs from "node:fs";
import { isValidInn, normalizeInn } from "@/lib/inn";
import { guillemets, parseParty, partyLabel } from "@/lib/dadata-parse";
import { LIMITS } from "@/lib/rate-limit";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ------------------------------------------------------- контрольная сумма

check("ИНН организации 7707083893 верный", isValidInn("7707083893"));
check("ИНН организации 7727563778 верный", isValidInn("7727563778"));
check("ИНН предпринимателя 500100732259 верный", isValidInn("500100732259"));
check("ИНН предпринимателя 773370857857 верный", isValidInn("773370857857"));

check("неверная последняя цифра у организации", !isValidInn("7707083890"));
check("неверная предпоследняя цифра у предпринимателя", !isValidInn("500100732249"));
check("неверная последняя цифра у предпринимателя", !isValidInn("500100732250"));
check("9 цифр - не ИНН", !isValidInn("770708389"));
check("11 цифр - не ИНН", !isValidInn("77070838931"));
check("13 цифр - не ИНН", !isValidInn("7707083893123"));
check("буквы - не ИНН", !isValidInn("77070838a3"));
check("пустая строка - не ИНН", !isValidInn(""));
check("не строка - не ИНН", !isValidInn(7707083893) && !isValidInn(null) && !isValidInn(undefined));

check("пробелы и дефисы из буфера обмена не мешают", isValidInn(" 7707-0838 93 "));
check("normalizeInn оставляет цифры", normalizeInn(" 7707 083893\n") === "7707083893");
check("normalizeInn не режет длинное молча", normalizeInn("77070838931234").length === 14);
check("normalizeInn не строки даёт пустое", normalizeInn(null) === "" && normalizeInn(5) === "");

// ------------------------------------------------------- разбор ответа

const legal = {
  suggestions: [
    {
      value: 'ООО "РОМАШКА"',
      unrestricted_value: 'ООО "РОМАШКА"',
      data: {
        inn: "5902000000",
        kpp: "590201001",
        ogrn: "1025900000000",
        type: "LEGAL",
        name: {
          full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "РОМАШКА"',
          short_with_opf: 'ООО "РОМАШКА"',
        },
        management: { name: "Иванов Иван Иванович", post: "ГЕНЕРАЛЬНЫЙ ДИРЕКТОР" },
        address: {
          value: "г Пермь, ул Ленина, д 1",
          unrestricted_value: "614000, Пермский край, г Пермь, ул Ленина, д 1",
          data: { city: "Пермь", region: "Пермский" },
        },
        state: { status: "ACTIVE" },
        okved: "47.91",
        phones: [{ value: "+7 000 000-00-00" }],
      },
    },
    { value: "другая", data: { inn: "5902111111", name: { short_with_opf: "ООО Вторая" } } },
  ],
};

let p = parseParty(legal);
check("юрлицо: найдено", p !== null);
check("юрлицо: ИНН, КПП, ОГРН", p?.inn === "5902000000" && p?.kpp === "590201001" && p?.ogrn === "1025900000000");
check("юрлицо: вид", p?.kind === "legal");
check("юрлицо: кавычки в «ёлочки»", p?.shortName === "ООО «РОМАШКА»", p?.shortName);
check("юрлицо: полное название", p?.fullName.startsWith("ОБЩЕСТВО С ОГРАНИЧЕННОЙ"));
check("юрлицо: адрес с индексом", p?.address === "614000, Пермский край, г Пермь, ул Ленина, д 1");
check("юрлицо: город", p?.city === "Пермь");
check("юрлицо: руководитель", p?.manager === "Иванов Иван Иванович");
check("юрлицо: действующее", p?.status === "active");
check("подпись «название, город»", partyLabel(p) === "ООО «РОМАШКА», Пермь");
check(
  "наружу идут только нужные поля",
  p && Object.keys(p).sort().join() ===
    "address,city,fullName,inn,kind,kpp,manager,ogrn,shortName,status",
  p && Object.keys(p).sort().join(),
);
check("лишнее из ответа DaData не просочилось", !JSON.stringify(p).includes("47.91") && !JSON.stringify(p).includes("000-00-00"));

const individual = {
  suggestions: [
    {
      value: "ИП Петров Пётр Петрович",
      data: {
        inn: "590200000011",
        kpp: null,
        ogrn: "304590200000011",
        type: "INDIVIDUAL",
        name: {
          full_with_opf: "Индивидуальный предприниматель Петров Пётр Петрович",
          short_with_opf: "ИП Петров Пётр Петрович",
        },
        fio: { surname: "Петров", name: "Пётр", patronymic: "Петрович" },
        management: null,
        address: { value: "г Пермь", unrestricted_value: "г Пермь", data: { city: "Пермь" } },
        state: { status: "ACTIVE" },
      },
    },
  ],
};
p = parseParty(individual);
check("ИП: вид", p?.kind === "individual");
check("ИП: КПП нет", p?.kpp === null);
check("ИП: ОГРНИП из 15 цифр", p?.ogrn === "304590200000011");
check("ИП: город проживания не выдаётся за юридический адрес", p?.address === null && p?.city === "Пермь");
check("ИП: ФИО", p?.manager === "Петров Пётр Петрович");
check("ИП: подпись", p && partyLabel(p) === "ИП Петров Пётр Петрович, Пермь");

const dead = structuredClone(legal);
dead.suggestions[0].data.state.status = "LIQUIDATED";
check("ликвидированная распознаётся", parseParty(dead)?.status === "liquidated");
dead.suggestions[0].data.state.status = "LIQUIDATING";
check("в процессе ликвидации распознаётся", parseParty(dead)?.status === "liquidating");
dead.suggestions[0].data.state.status = "constructor";
check("неизвестный статус не берётся из прототипа", parseParty(dead)?.status === "unknown");
delete dead.suggestions[0].data.state;
check("без статуса - unknown", parseParty(dead)?.status === "unknown");

check("пустой список - null", parseParty({ suggestions: [] }) === null);
check("мусор вместо тела - null", [null, undefined, 5, "x", [], {}, { suggestions: "a" }].every((b) => parseParty(b) === null));
check("запись без ИНН пропускается", parseParty({ suggestions: [{ value: "x", data: { inn: "abc", name: { short_with_opf: "x" } } }] }) === null);
check("пропускает негодную запись и берёт следующую", parseParty({ suggestions: [{ data: null }, ...legal.suggestions] })?.inn === "5902000000");

const long = structuredClone(legal);
long.suggestions[0].data.address.unrestricted_value = "а".repeat(5000);
long.suggestions[0].data.name.short_with_opf = "б".repeat(900);
p = parseParty(long);
check("адрес не длиннее колонки", (p?.address?.length ?? 0) <= 1000);
check("название не длиннее колонки", (p?.shortName.length ?? 0) <= 255);

check("кавычки: ровно две - ёлочки", guillemets('ООО "А"') === "ООО «А»");
check("кавычки: вложенные не трогаем", guillemets('ООО "А "Б""') === 'ООО "А "Б""');
check("кавычки: нет - как есть", guillemets("ИП Иванов") === "ИП Иванов");

// ------------------------------------------------------- маршрут и лимиты

check(
  "лимиты подсказки заданы по пользователю и по адресу",
  LIMITS.partyLookupUser.max > 0 && LIMITS.partyLookupIp.max >= LIMITS.partyLookupUser.max,
);

const route = read("src/app/api/suggestions/party/route.ts");
const lib = read("src/lib/dadata.ts");

check("маршрут: без ключа 404 раньше всего остального",
  route.indexOf("isDadataEnabled()") !== -1 && route.indexOf("isDadataEnabled()") < route.indexOf("currentUser()"));
check("маршрут: только вошедший", route.includes("currentUser()") && route.includes("401"));
check("маршрут: ИНН с контрольной суммой до обращения к DaData",
  route.indexOf("isValidInn(") !== -1 && route.indexOf("isValidInn(") < route.indexOf("findPartyByInn("));
check("маршрут: лимит по пользователю и по адресу, до запроса",
  route.includes('"partyLookupUser"') && route.includes('"partyLookupIp"') &&
  route.indexOf("checkRateLimit(") < route.indexOf("findPartyByInn("));
check("маршрут: попытка записывается", route.includes("recordAttempt("));
check("маршрут: сбой DaData не пробрасывается текстом", !/message:\s*(e|err|error)\b/.test(route) && route.includes("502"));
check("DaData: таймаут запроса", /AbortSignal\.timeout\(TIMEOUT_MS\)/.test(lib) && /TIMEOUT_MS\s*=\s*5000/.test(lib));
check("DaData: заголовок Authorization: Token", lib.includes("`Token ${key}`"));
check("DaData: адрес из документации", lib.includes("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"));
check("DaData: ключ не пишется в лог", !/console\.\w+\([^)]*\bkey\b/.test(lib));

for (const f of [".env.example", ".env.production.example"]) {
  const t = read(f);
  check(`${f}: ключ есть и пустой`, /^DADATA_API_KEY=""/m.test(t));
}
check("compose пробрасывает ключ в приложение", read("docker-compose.yml").includes("DADATA_API_KEY: ${DADATA_API_KEY:-}"));

// Формы показывают кнопку только когда подсказка включена
for (const f of [
  "src/app/(site)/client/settings/ProfileForm.tsx",
  "src/app/admin/counterparties/CounterpartyForm.tsx",
  "src/app/admin/suppliers/SupplierForm.tsx",
]) {
  const t = read(f);
  check(`${f.split("/").pop()}: кнопка только при innLookup`, /\{innLookup && \(\s*<InnLookup/.test(t) && /innLookup = false/.test(t));
}
for (const f of [
  "src/app/(site)/client/settings/page.tsx",
  "src/app/admin/counterparties/page.tsx",
  "src/app/admin/counterparties/[id]/page.tsx",
  "src/app/admin/suppliers/new/page.tsx",
  "src/app/admin/suppliers/[id]/page.tsx",
]) {
  check(`${f.replace("src/app/", "")}: включённость берётся из ключа`, read(f).includes("innLookup={isDadataEnabled()}"));
}

process.exitCode = failed ? 1 : 0;
console.log(failed ? `\nПровалено: ${failed}` : "\nВсё в порядке");
