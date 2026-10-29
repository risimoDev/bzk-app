/**
 * Проверка доверия к сертификату Точка Банка (без сетевых запросов).
 *
 *   node --experimental-strip-types scripts/check-tochka-tls.mjs
 *
 * enter.tochka.com подписан Russian Trusted Root CA (Минцифры), которого нет
 * в хранилище Node: без NODE_EXTRA_CA_CERTS fetch падает с
 * SELF_SIGNED_CERT_IN_CHAIN ещё до авторизации. Стережём, что сертификат
 * лежит в репозитории, не подменён, попадает в образ и что обе стадии
 * Dockerfile (runner - приложение, builder - служебный контейнер tools)
 * получают переменную. И что никто не «чинил» это отключением проверки TLS.
 */
import { X509Certificate } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { describeNetworkError } from "../src/lib/tochka-errors.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const read = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const CERT = "deploy/certs/russian_trusted_root_ca.pem";
// SHA-256 корневого сертификата Russian Trusted Root CA со страницы Госуслуг
const SHA256 =
  "D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31";

// ----------------------------------------------------------- сертификат

check("сертификат лежит в deploy/certs", existsSync(CERT));

if (existsSync(CERT)) {
  let x509 = null;
  try {
    x509 = new X509Certificate(readFileSync(CERT));
  } catch (e) {
    check("сертификат читается как PEM", false, String(e));
  }
  if (x509) {
    check("SHA-256 совпадает с официальным", x509.fingerprint256 === SHA256, x509.fingerprint256);
    check("это корневой центр Минцифры", /Russian Trusted Root CA/.test(x509.subject), x509.subject.replace(/\n/g, ", "));
    check("самоподписанный (корневой)", x509.subject === x509.issuer);
    const left = (new Date(x509.validTo).getTime() - Date.now()) / 86_400_000;
    check("срок действия не истёк", left > 0, `до ${x509.validTo}`);
    check("до конца срока больше года", left > 365, `осталось ~${Math.floor(left)} дн.; пора заменить, если меньше`);
  }
}

// -------------------------------------------------------------- Dockerfile

const docker = read("Dockerfile");

// Разбиваем на стадии: FROM ... AS name
const stages = new Map();
let current = null;
for (const line of docker.split("\n")) {
  const m = line.match(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/i);
  if (m) {
    current = (m[1] ?? `stage${stages.size}`).toLowerCase();
    stages.set(current, []);
  } else if (current) {
    stages.get(current).push(line);
  }
}
const body = (name) => (stages.get(name) ?? []).filter((l) => !l.trim().startsWith("#")).join("\n");

const builder = body("builder");
const runner = body("runner");
check("в Dockerfile есть стадии builder и runner", builder !== "" && runner !== "");

const envOf = (b) => b.match(/^\s*ENV\s+NODE_EXTRA_CA_CERTS[=\s]+(\S+)/m)?.[1] ?? null;
const builderEnv = envOf(builder);
const runnerEnv = envOf(runner);

check("builder (из неё собран tools): NODE_EXTRA_CA_CERTS задан", builderEnv !== null, String(builderEnv));
check(
  "builder: указывает на файл из репозитория (COPY . . его приносит)",
  builderEnv !== null && builderEnv.endsWith("/" + CERT) && /^\s*COPY\s+\.\s+\.\s*$/m.test(builder),
);
// ENV должен идти после COPY . ., иначе это просто декоративная строка перед копированием
check(
  "builder: ENV стоит после COPY . .",
  builder.indexOf("NODE_EXTRA_CA_CERTS") > builder.search(/^\s*COPY\s+\.\s+\.\s*$/m),
);

check("runner (приложение): NODE_EXTRA_CA_CERTS задан", runnerEnv !== null, String(runnerEnv));
const copyLine = runner.split("\n").find((l) => /^\s*COPY\b/.test(l) && l.includes("russian_trusted_root_ca.pem"));
check("runner: Dockerfile копирует сертификат", Boolean(copyLine));
if (copyLine) {
  const parts = copyLine.trim().split(/\s+/);
  const dest = parts[parts.length - 1];
  check("runner: копируется из builder", /--from=builder/.test(copyLine));
  check("runner: источник - deploy/certs", copyLine.includes("/app/" + CERT));
  check("runner: путь ENV совпадает с местом, куда скопирован файл", dest === runnerEnv, `${dest} / ${runnerEnv}`);
}
// Копия должна идти до смены пользователя: иначе нет прав писать в /app/certs
const userAt = runner.search(/^\s*USER\s/m);
check("runner: сертификат копируется до USER nextjs", userAt === -1 || runner.indexOf("russian_trusted_root_ca.pem") < userAt);

// ------------------------------------------------ контекст сборки и git

const ignored = read(".dockerignore")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
check(
  ".dockerignore не исключает deploy/certs",
  !ignored.some((p) => !p.startsWith("!") && (/^\/?deploy\/?$/.test(p) || /^\/?deploy\/certs/.test(p) || /^\*+\/?\*?\.pem$/.test(p) || p === "*.pem")),
);

const gitignore = read(".gitignore");
check(
  ".gitignore пропускает сертификат (иначе *.pem не попадёт на сервер)",
  !/^\*\.pem\s*$/m.test(gitignore) || /^!deploy\/certs\/\*\.pem\s*$/m.test(gitignore),
);

// ------------------------------------------------ локальный запуск next

const pkg = JSON.parse(read("package.json"));
check("npm run dev идёт через обёртку с сертификатом", /next-with-ca\.mjs\s+dev/.test(pkg.scripts.dev ?? ""), pkg.scripts.dev);
check("обёртка существует", existsSync("scripts/next-with-ca.mjs"));
check(
  "обёртка выставляет NODE_EXTRA_CA_CERTS из deploy/certs",
  /NODE_EXTRA_CA_CERTS/.test(read("scripts/next-with-ca.mjs")) && read("scripts/next-with-ca.mjs").includes("russian_trusted_root_ca.pem"),
);

// ------------------------------------- проверку TLS никто не отключал

for (const f of ["Dockerfile", "docker-compose.yml", "deploy/compose.tools.yml", ".env.example", ".env.production.example", "package.json", "src/lib/tochka.ts"]) {
  const t = read(f).split("\n").filter((l) => !/^\s*(#|\/\/|\*)/.test(l)).join("\n");
  check(`${f}: NODE_TLS_REJECT_UNAUTHORIZED не трогается`, !/NODE_TLS_REJECT_UNAUTHORIZED/.test(t));
}
check("tochka.ts: нет rejectUnauthorized: false", !/rejectUnauthorized\s*:\s*false/.test(read("src/lib/tochka.ts")));

// ---------------------------------- понятная причина сетевой ошибки

const withCause = (code, message = "fetch failed") =>
  Object.assign(new TypeError(message), { cause: Object.assign(new Error("x"), { code }) });

const tls = describeNetworkError(withCause("SELF_SIGNED_CERT_IN_CHAIN"));
check("SELF_SIGNED_CERT_IN_CHAIN: понятная причина про Минцифры", /Минцифры/.test(tls) && tls.includes("SELF_SIGNED_CERT_IN_CHAIN"), tls.slice(0, 60) + "…");
check("UNABLE_TO_VERIFY_LEAF_SIGNATURE: тоже про сертификат", /Минцифры/.test(describeNetworkError(withCause("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))));
check("ENOTFOUND: про адрес банка", /DNS/.test(describeNetworkError(withCause("ENOTFOUND"))));
check("таймаут: про 30 секунд", /30 секунд/.test(describeNetworkError(Object.assign(new Error("t"), { name: "TimeoutError" }))));
const unknown = describeNetworkError(withCause("SOMETHING_NEW"));
check("неизвестный код виден администратору", unknown.includes("SOMETHING_NEW"), unknown);
check("«constructor» вместо кода не даёт подсказки из прототипа", !/function|\[object/.test(describeNetworkError(withCause("constructor"))));
// Токен живёт в заголовке запроса, а не в ошибке; но если бы он просочился в
// сообщение причины, длина вывода всё равно ограничена
check("вывод ограничен по длине", describeNetworkError(new Error("a".repeat(5000))).length <= 200);

process.exitCode = failed ? 1 : 0;
console.log(failed ? `\nПровалено: ${failed}` : "\nВсё в порядке");
