/**
 * Проверка правил жизни сессии: отзыв по версии и срок сотрудника.
 *
 *   npm run check:session
 *
 * JWT сам себя не отзывает, поэтому весь отзыв держится на двух правилах
 * из `lib/session-policy.ts`: версия в токене должна совпадать с версией
 * в базе, а сотрудник входит заново не реже раза в неделю. Часть про базу
 * (UPDATE ... session_version + 1) проверяется на своём пользователе.
 */
import fs from "node:fs";
import {
  STAFF_SESSION_MAX_AGE_MS,
  sessionRevoked,
  sessionVersionMatches,
  staffSessionExpired,
} from "@/lib/session-policy";

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " - " + extra : ""}`);
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 5, 12, 0, 0);

// ---- версия
check("одинаковые версии совпадают", sessionVersionMatches(3, 3));
check("выросшая в базе версия отзывает токен", !sessionVersionMatches(3, 4));
check("токен новее базы тоже отвергается", !sessionVersionMatches(5, 4));
check("старый токен без версии равен нулю", sessionVersionMatches(undefined, 0));
check("старый токен без версии отзывается после первого роста", !sessionVersionMatches(undefined, 1));
check("в базе пусто - считается нулём", sessionVersionMatches(0, null));
check("строка вместо числа в токене не проходит как версия", !sessionVersionMatches("2", 2));

// ---- срок сотрудника
check("срок сотрудника - семь дней", STAFF_SESSION_MAX_AGE_MS === 7 * DAY);
check("сотрудник через шесть дней ещё в сессии", !staffSessionExpired("manager", now - 6 * DAY, now));
check("администратор через восемь дней вышел", staffSessionExpired("admin", now - 8 * DAY, now));
check("ровно семь дней - ещё действует", !staffSessionExpired("admin", now - 7 * DAY, now));
check("клиент через двадцать дней в сессии", !staffSessionExpired("user", now - 20 * DAY, now));
check("клиенту отметка входа не нужна", !staffSessionExpired("user", undefined, now));
check("у сотрудника без отметки входа сессия закрыта", staffSessionExpired("manager", undefined, now));
check("мусор вместо отметки входа - закрыта", staffSessionExpired("admin", "вчера", now));

// ---- вместе
const base = { role: "admin", tokenVersion: 2, currentVersion: 2, loginAt: now - DAY, now };
check("свежая сессия сотрудника действует", !sessionRevoked(base));
check("версия выросла - отозвана", sessionRevoked({ ...base, currentVersion: 3 }));
check("неделя прошла - отозвана", sessionRevoked({ ...base, loginAt: now - 8 * DAY }));
check(
  "клиент: версия та же, давний вход - действует",
  !sessionRevoked({ ...base, role: "user", loginAt: now - 25 * DAY }),
);
check(
  "клиент: версия выросла - отозвана",
  sessionRevoked({ ...base, role: "user", currentVersion: 3 }),
);
// Роль берётся из базы: клиента, которого сделали сотрудником, срок тоже касается
check(
  "повышенный до сотрудника подпадает под срок",
  sessionRevoked({ ...base, role: "manager", loginAt: now - 10 * DAY }),
);

// ---- в базе: рост версии отзывает, остальные пользователи не задеты
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}
const { db } = await import("../src/db/index.ts");
const { users } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const { revokeAllSessions } = await import("../src/lib/sessions-db.ts");

const EMAIL = "check-session@example.invalid";
const EMAIL2 = "check-session-2@example.invalid";
await db.delete(users).where(eq(users.email, EMAIL));
await db.delete(users).where(eq(users.email, EMAIL2));

const [a] = await db
  .insert(users)
  .values({ name: "Проверка сессии", email: EMAIL, password: "не-важно", role: "user" })
  .returning({ id: users.id, v: users.sessionVersion });
const [b] = await db
  .insert(users)
  .values({ name: "Проверка сессии 2", email: EMAIL2, password: "не-важно", role: "user" })
  .returning({ id: users.id });

try {
  check("новый пользователь начинает с нуля", a.v === 0);

  await revokeAllSessions(a.id);
  await Promise.all([revokeAllSessions(a.id), revokeAllSessions(a.id)]);
  const [afterA] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.id, a.id));
  const [afterB] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.id, b.id));

  check("три отзыва подряд (два одновременных) дали +3", afterA.v === 3, String(afterA.v));
  check("версия чужого пользователя не тронута", afterB.v === 0);
  check("токен со старой версией теперь отвергается", !sessionVersionMatches(0, afterA.v));
} finally {
  await db.delete(users).where(eq(users.email, EMAIL));
  await db.delete(users).where(eq(users.email, EMAIL2));
}

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
