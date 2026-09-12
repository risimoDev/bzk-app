/**
 * Проверка мер безопасности.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-security.mjs
 *
 * Стережёт то, что легко откатить незаметной правкой: сложность пароля,
 * отсев одноразовой почты, постоянное по времени сравнение секретов и
 * то, что каждое серверное действие проверяет права. Здесь же - набор
 * заголовков безопасности и CSP, чтобы их случайно не ослабили.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { checkPassword } from "../src/lib/password-policy.ts";
import { isDisposableEmail, emailDomain } from "../src/lib/email-guard.ts";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

// ------------------------------------------------ сложность пароля

check("короткий пароль отклонён", checkPassword("Ab1") !== null);
check("без заглавной - отклонён", checkPassword("abcdef12") !== null);
check("без строчной - отклонён", checkPassword("ABCDEF12") !== null);
check("без цифры - отклонён", checkPassword("Abcdefgh") !== null);
check("длиннее 72 - отклонён", checkPassword("Ab1" + "x".repeat(80)) !== null);
check("нормальный пароль принят", checkPassword("Parol-2026") === null);
check("кириллический пароль принят", checkPassword("Пароль2Тест") === null);

// --------------------------------------------- одноразовая почта

check("mailinator отклонён", isDisposableEmail("a@mailinator.com"));
check("поддомен одноразовой почты отклонён", isDisposableEmail("a@inbox.mailinator.com"));
check("yandex пропущен", !isDisposableEmail("a@yandex.ru"));
check("gmail пропущен", !isDisposableEmail("a@gmail.com"));
check("домен разбирается", emailDomain("Bob@Example.RU") === "example.ru");
check("не-почта не ломает разбор", emailDomain("вообще-не-почта") === null);

// -------------------------------------------- проверки в исходниках

const SRC = path.resolve("src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

// Каждое серверное действие - открытый эндпоинт: у экспортируемой функции
// в файле "use server" должна быть проверка прав или текущего пользователя.
// Исключения намеренные и перечислены поимённо.
const PUBLIC_ACTIONS = new Set([
  "login", // сам проверяет пароль и второй фактор
  "register", // публичная регистрация, ограничена по адресу
  "logout", // выход прав не требует
  "sendContactMessage", // форма связи, ловушка + ограничение частоты
  "requestPasswordReset", // публичная, ограничена по адресу и почте
  "resetPassword", // защищена одноразовым токеном из письма
  "addToCart",
  "setQuantity",
  "removeFromCart",
  "clearCart", // корзина анонимная
  "applyPromocode", // анонимная проверка, ограничена по адресу
]);

let guarded = 0;
let unguarded = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!/^["']use server["']/m.test(src)) continue;

  const hasGuard = /\b(can|currentUser|staffOnly|mayEdit|mayManage|requireStaff)\s*\(/.test(src);
  for (const m of src.matchAll(/export async function (\w+)/g)) {
    const name = m[1];
    if (PUBLIC_ACTIONS.has(name)) continue;
    // Грубая, но действенная проверка: в файле действия есть хоть один
    // страж. Точечно закрытые файлы держат все действия под одной охраной
    if (hasGuard) guarded++;
    else {
      unguarded++;
      console.log(`  ⚠ ${path.relative(SRC, file)} → ${name}: не видно проверки прав`);
    }
  }
}
check(`серверные действия под охраной (${guarded})`, unguarded === 0, unguarded ? `без охраны: ${unguarded}` : "");

// ----------------------------------------------- CSP и заголовки

const proxy = readFileSync(path.join(SRC, "proxy.ts"), "utf8");
check("CSP: default-src self", proxy.includes("default-src 'self'"));
check("CSP: скрипты по nonce", proxy.includes("'nonce-") && proxy.includes("'strict-dynamic'"));
check("CSP: object-src none", proxy.includes("object-src 'none'"));
check("CSP: frame-ancestors none", proxy.includes("frame-ancestors 'none'"));
check("CSP: form-action self", proxy.includes("form-action 'self'"));
check(
  "CSP: unsafe-eval только в разработке",
  /dev \? " 'unsafe-eval'" : ""|`\$\{dev \? " 'unsafe-eval'" : ""\}`/.test(proxy) ||
    proxy.includes("dev ? \" 'unsafe-eval'\" : \"\""),
);

const config = readFileSync(path.resolve("next.config.ts"), "utf8");
check("X-Powered-By выключен", config.includes("poweredByHeader: false"));
for (const h of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
  check(`заголовок ${h}`, config.includes(h));
}
check("проверка Origin для действий (allowedOrigins)", config.includes("allowedOrigins"));

// --------------------------------------- секреты сравниваются безопасно

const telegram = readFileSync(path.join(SRC, "lib/telegram.ts"), "utf8");
check("секрет вебхука - timingSafeEqual", telegram.includes("timingSafeEqual"));
const reset = readFileSync(path.join(SRC, "lib/password-reset.ts"), "utf8");
check("токен сброса хранится хешем", reset.includes("createHash") && reset.includes("sha256"));
check("токен сброса сравнивается безопасно", reset.includes("timingSafeEqual"));

// ------------------------------- выдача приватных файлов проверяет владельца

const uploadsRoute = readFileSync(path.join(SRC, "app/api/uploads/[id]/route.ts"), "utf8");
check("выдача файла требует входа", uploadsRoute.includes("currentUser"));
check("выдача файла проверяет владельца", /userId|owner/.test(uploadsRoute));
check("приватный файл не кешируется", uploadsRoute.includes("private, no-store"));

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
