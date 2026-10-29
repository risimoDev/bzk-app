/**
 * Проверка токена второго шага входа.
 *
 *   npm run check:login-challenge
 *
 * Токен позволяет второму шагу входа (код 2FA) не спрашивать капчу ещё
 * раз. Раньше капчу пропускало любое непустое поле `totp`, и бот обходил
 * её, просто дописывая это поле. Проверяем, что пропуск даёт только
 * подлинный, свежий токен для той же почты, и что действие входа не
 * вернулось к старому признаку.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  issueLoginChallenge,
  verifyLoginChallenge,
  isCredentialsAuthPath,
  LOGIN_CHALLENGE_TTL_MS,
} from "../src/lib/login-challenge.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
};

const SECRET = "проверочный-секрет";
const OTHER = "другой-секрет";
const EMAIL = "Staff@Example.ru";
const now = 1_800_000_000_000;

const token = issueLoginChallenge(EMAIL, now, SECRET);

check("токен выдан", /^\d+\.[A-Za-z0-9_-]{43}$/.test(token), token);
check("свежий токен подходит", verifyLoginChallenge(token, EMAIL, now + 1000, SECRET));
check(
  "почта сравнивается без регистра и пробелов",
  verifyLoginChallenge(token, "  staff@example.ru ", now, SECRET),
);
check("чужая почта не подходит", !verifyLoginChallenge(token, "other@example.ru", now, SECRET));
check("другой секрет не подходит", !verifyLoginChallenge(token, EMAIL, now, OTHER));
check(
  "у границы срока ещё подходит",
  verifyLoginChallenge(token, EMAIL, now + LOGIN_CHALLENGE_TTL_MS, SECRET),
);
check(
  "просроченный не подходит",
  !verifyLoginChallenge(token, EMAIL, now + LOGIN_CHALLENGE_TTL_MS + 1, SECRET),
);
check("срок - пять минут", LOGIN_CHALLENGE_TTL_MS === 5 * 60 * 1000);
check(
  "токен «из будущего» не подходит",
  !verifyLoginChallenge(token, EMAIL, now - 10 * 60 * 1000, SECRET),
);

// Подмена времени выдачи: подпись привязана к нему, продлить токен нельзя
const [, sig] = token.split(".");
check(
  "сдвинутое время выдачи не подходит",
  !verifyLoginChallenge(`${now + 60_000}.${sig}`, EMAIL, now + 60_000, SECRET),
);

// Мусор не роняет проверку
for (const junk of ["", "1", "abc.def", `${now}.`, `.${sig}`, `${now}.${sig}x`, `-1.${sig}`]) {
  check(`мусор «${junk.slice(0, 20)}» не подходит`, !verifyLoginChallenge(junk, EMAIL, now, SECRET));
}

check("без секрета токен не выдаётся", issueLoginChallenge(EMAIL, now, "") === "");
check("без секрета токен не принимается", !verifyLoginChallenge(token, EMAIL, now, ""));

// --------------------------------------------- действие входа в исходнике

const actions = readFileSync(path.resolve("src/app/(site)/login/actions.ts"), "utf8");
check(
  "капча не пропускается по одному полю кода",
  !/if\s*\(\s*!\s*formData\.get\(\s*["']totp["']\s*\)\s*\)/.test(actions),
);
check("пропуск капчи - только по токену", actions.includes("verifyLoginChallenge("));
check("токен выдаётся после верного пароля", actions.includes("issueLoginChallenge("));

const lib = readFileSync(path.resolve("src/lib/login-challenge.ts"), "utf8");
check("подпись сравнивается безопасно", lib.includes("timingSafeEqual"));
check(
  "модуль не тянет @/auth и next/headers",
  !/from\s+["'](@\/auth|next\/headers)["']/.test(lib),
);

// ------------------------- HTTP-маршрут Auth.js не пускает к паролю

// Через него authorize вызывался бы без капчи и без токена второго шага
for (const p of [
  "/api/auth/callback/credentials",
  "/api/auth/callback//credentials",
  "/api/auth/callback/Credentials",
  "/api/auth/callback/cred%65ntials",
  "/api/auth/signin/credentials",
  "/api/auth/callback/credentials/",
]) {
  check(`закрыт ${p}`, isCredentialsAuthPath(p));
}
for (const p of ["/api/auth/session", "/api/auth/signout", "/api/auth/csrf", "/api/auth/providers"]) {
  check(`открыт ${p}`, !isCredentialsAuthPath(p));
}

const route = readFileSync(path.resolve("src/app/api/auth/[...nextauth]/route.ts"), "utf8");
check(
  "маршрут не отдаёт POST Auth.js как есть",
  !/export\s+const\s*\{[^}]*\bPOST\b[^}]*\}\s*=\s*handlers/.test(route),
);
check(
  "POST маршрута отсекает вход по паролю",
  /export\s+async\s+function\s+POST/.test(route) &&
    route.includes("isCredentialsAuthPath(") &&
    /status:\s*404/.test(route),
);

const auth = readFileSync(path.resolve("src/auth.ts"), "utf8");
check(
  "успешный вход не снимает счётчик по адресу",
  !/clearAttempts\([^)]*["']loginIp["']\)/.test(auth),
);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
