/**
 * Правила админки, которые легко потерять незаметной правкой.
 *
 *   npm run check:admin
 *
 * Часть проверок - по исходникам (без базы), часть ходит в базу: заводит
 * своих пользователей и убирает их за собой.
 *
 *  - CRM и контрагенты закрыты собственными модулями прав, а не `users`;
 *  - исполнитель задачи и ответственный по лиду - только действующий
 *    сотрудник;
 *  - действия над пользователями: админа трогает только админ, себя не
 *    блокируют, всё идёт в журнал;
 *  - печатные формы не показывают клиенту предупреждения и ссылку в
 *    админку, а кабинет - чужие по типу документы;
 *  - каждое действие админки, которое пишет в базу, пишет и в журнал;
 *  - права читаются через React cache и не тянут next/headers.
 */
import fs from "node:fs";
import path from "node:path";

// Под голым node .env никто не читает: разбираем сами. Сначала отрезаем
// комментарий, потом кавычки - иначе в значении остаётся хвостовая
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

const SRC = path.resolve("src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

// ------------------------------------------------- модули прав CRM

const crmFiles = [
  "app/actions/crm.ts",
  ...walk(path.join(SRC, "app/admin/crm")).map((f) => path.relative(SRC, f)),
];
const counterpartyFiles = [
  "app/actions/counterparties.ts",
  ...walk(path.join(SRC, "app/admin/counterparties")).map((f) => path.relative(SRC, f)),
];

for (const f of [...crmFiles, ...counterpartyFiles]) {
  check(`${f}: право не через users`, !/can\(\s*["']users["']/.test(read(f)));
}
check(
  "CRM проверяет право crm",
  crmFiles.every((f) => !f.endsWith("page.tsx") || /can\(\s*["']crm["']/.test(read(f))),
);
check(
  "контрагенты проверяют право counterparties",
  counterpartyFiles.every(
    (f) => !f.endsWith("page.tsx") || /can\(\s*["']counterparties["']/.test(read(f)),
  ),
);

const nav = read("components/admin/AdminNav.tsx");
check(
  "меню: CRM - модуль crm",
  /"\/admin\/crm"[^}]*module: "crm"/.test(nav),
);
check(
  "меню: контрагенты - модуль counterparties",
  /"\/admin\/counterparties"[^}]*module: "counterparties"/.test(nav),
);

const tochka = read("app/actions/tochka.ts");
check(
  "сверка Точки требует finance.edit",
  /export async function syncPaymentStatuses[\s\S]*?can\(\s*["']finance["'],\s*["']edit["']/.test(tochka),
);

// --------------------------------------- исполнитель - только сотрудник

for (const f of ["app/actions/tasks.ts", "app/actions/crm.ts"]) {
  const src = read(f);
  check(`${f}: исполнитель проверяется как сотрудник`, src.includes("isActiveStaff("));
}
for (const f of ["app/admin/tasks/page.tsx", "app/admin/crm/page.tsx"]) {
  check(`${f}: список из staffOptions`, read(f).includes("staffOptions"));
}

// ------------------------------- действия над пользователями (S16)

const clientsActions = read("app/admin/clients/actions.ts");
const exported = [...clientsActions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
check("действия над пользователями найдены", exported.length >= 4, String(exported.length));
check(
  "админа трогает только админ",
  /target\.role === "admin" && me\.role !== "admin"/.test(clientsActions),
);
check("себя заблокировать нельзя", /if \(t\.self\) return;/.test(clientsActions));
const chunks = clientsActions.split(/\nexport async function /).slice(1);
for (const chunk of chunks) {
  const name = /^(\w+)/.exec(chunk)[1];
  check(`${name}: проверяет цель`, chunk.includes("loadTarget("));
  check(`${name}: пишет журнал`, chunk.includes("audit("));
}

// --------------------------------------- печатные формы и кабинет (S14)

for (const f of ["app/print/invoice/[source]/[id]/page.tsx", "app/print/upd/[source]/[id]/page.tsx"]) {
  const src = read(f);
  check(`${f}: предупреждение только сотруднику`, /warning=\{[\s\S]{0,200}access\.isStaff/.test(src));
  check(
    `${f}: ссылка в админку только сотруднику`,
    /settingsHref=\{access\.isStaff \?/.test(src),
  );
}
check(
  "кабинет: клиенту только исходящие документы",
  /eq\(documents\.docType, "outgoing"\)/.test(read("app/(site)/client/orders/[id]/page.tsx")),
);

// ------------------------------------------------- журнал действий (A20)

// Файлы, где каждое действие - изменение, которое сотрудник потом будет
// разбирать. Действие, которое пишет в базу, обязано вызвать audit().
const AUDITED_FILES = [
  "app/actions/catalogs.ts",
  "app/actions/company.ts",
  "app/actions/counterparties.ts",
  "app/actions/crm.ts",
  "app/actions/document-templates.ts",
  "app/actions/documents.ts",
  "app/actions/external-orders.ts",
  "app/actions/finance.ts",
  "app/actions/inbox.ts",
  "app/actions/offers.ts",
  "app/actions/production-stages.ts",
  "app/actions/quality.ts",
  "app/actions/seo.ts",
  "app/actions/suppliers.ts",
  "app/actions/tasks.ts",
  "app/actions/tochka.ts",
  "app/admin/clients/actions.ts",
  "app/admin/orders/actions.ts",
  "app/admin/production/actions.ts",
  "app/admin/products/actions.ts",
  "app/admin/products/attribute-actions.ts",
  "app/admin/purchases/actions.ts",
  "app/admin/materials/actions.ts",
];

// Намеренные исключения - рабочий шум, который журнал бы только засорил:
// чат по заказу, отметка «просмотрено», касания и напоминания CRM,
// пометка обращения прочитанным.
const NOT_AUDITED = new Set([
  "app/admin/orders/actions.ts:markSeen",
  "app/admin/orders/actions.ts:replyToOrderChat",
  "app/actions/crm.ts:logInteraction",
  "app/actions/crm.ts:createReminder",
  "app/actions/crm.ts:completeReminder",
  "app/actions/inbox.ts:setMessageStatus",
  "app/actions/tasks.ts:commentTask",
  // у срока готовности своя история с причиной (external_order_ready_history)
  "app/actions/external-orders.ts:setReadyDate",
  "app/actions/tochka.ts:syncPaymentStatuses", // пишет по строке на каждый платёж внутри цикла
  // движение склада вручную: журнал склада - сама таблица движений
  "app/admin/materials/actions.ts:recordMovement",
]);

let writers = 0;
const silent = [];
for (const f of AUDITED_FILES) {
  const src = read(f);
  for (const chunk of src.split(/\nexport async function /).slice(1)) {
    const name = /^(\w+)/.exec(chunk)[1];
    if (NOT_AUDITED.has(`${f}:${name}`)) continue;
    // Пишет в базу сама или передаёт запись сервисной функции в транзакции
    const writes = /\b(db|tx)\s*\.\s*(insert|update|delete)\(|db\.transaction\(/.test(chunk);
    if (!writes) continue;
    writers++;
    if (!chunk.includes("audit(")) silent.push(`${f}:${name}`);
  }
}
check(
  `действия админки пишут в журнал (${writers})`,
  silent.length === 0,
  silent.length ? `без журнала: ${silent.join(", ")}` : "",
);

// ------------------------------------------------------ права и cache

const perms = read("lib/permissions.ts");
check("права: React cache", /import \{ cache \} from "react"/.test(perms) && perms.includes("cache("));
check("права: не тянут next/headers", !perms.includes("next/headers"));
check("права: модуль crm в списке", /\|\s*"crm"/.test(perms) && /\|\s*"counterparties"/.test(perms));
check(
  "can() не ходит в базу сам",
  !/export async function can[\s\S]*?db\.select/.test(perms),
);

// ----------------------------------------------- база: права и роли

const { eq, and, inArray } = await import("drizzle-orm");
const { db } = await import("@/db");
const { users, rolePermissions } = await import("@/db/schema");
const { isActiveStaff } = await import("@/lib/staff-db");

const perm = await db
  .select({ role: rolePermissions.role, module: rolePermissions.module, action: rolePermissions.action })
  .from(rolePermissions)
  .where(inArray(rolePermissions.module, ["users", "crm", "counterparties"]));

for (const mod of ["crm", "counterparties"]) {
  for (const role of ["admin", "manager"]) {
    const of = (m) =>
      perm
        .filter((p) => p.role === role && p.module === m)
        .map((p) => p.action)
        .sort()
        .join(",");
    // Пустая база (CI): у роли нет прав на users - копировать нечего, сверка
    // осмысленна только на базе с данными
    const expected = of("users");
    check(
      `${role}: права ${mod} не меньше, чем были на users`,
      expected === "" || (of(mod) !== "" && of(mod) === expected),
      expected === "" ? "на users прав нет - сверять нечего" : of(mod),
    );
  }
}

const MARK = "staff-check@check.invalid";
const ids = [];
try {
  const mk = async (email, role, isBlocked = false) => {
    const [u] = await db
      .insert(users)
      .values({ name: "Проверка персонала", email, password: "x", role, isBlocked })
      .returning({ id: users.id });
    ids.push(u.id);
    return u.id;
  };

  const manager = await mk(`m-${MARK}`, "manager");
  const admin = await mk(`a-${MARK}`, "admin");
  const client = await mk(`c-${MARK}`, "user");
  const blockedManager = await mk(`b-${MARK}`, "manager", true);

  check("менеджер - исполнитель", (await isActiveStaff(manager)) === true);
  check("админ - исполнитель", (await isActiveStaff(admin)) === true);
  check("клиент - не исполнитель", (await isActiveStaff(client)) === false);
  check("заблокированный сотрудник - не исполнитель", (await isActiveStaff(blockedManager)) === false);
  check("несуществующий id - не исполнитель", (await isActiveStaff(2147483000)) === false);
} finally {
  for (const id of ids) await db.delete(users).where(eq(users.id, id));
}

const left = await db
  .select({ id: users.id })
  .from(users)
  .where(and(inArray(users.email, ["m", "a", "c", "b"].map((p) => `${p}-${MARK}`))));
check("тестовые строки удалены", left.length === 0);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
// process.exit на Windows роняет воркер модульных хуков
process.exitCode = failed === 0 ? 0 : 1;
