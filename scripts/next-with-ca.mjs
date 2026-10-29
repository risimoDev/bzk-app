/**
 * Запуск `next dev` / `next start` с корневым сертификатом Минцифры.
 *
 *   node scripts/next-with-ca.mjs dev [аргументы next]
 *
 * Точка Банк (enter.tochka.com) подписан сертификатом Минцифры, которого
 * нет в хранилище Node. Переменную NODE_EXTRA_CA_CERTS Node читает один раз
 * при старте процесса, поэтому строка в .env не поможет: Next подхватывает
 * .env уже внутри запущенного node. Отсюда обёртка - она выставляет
 * переменную и запускает next. В Docker то же самое делает ENV в Dockerfile.
 *
 * Работает одинаково в Windows и Linux, без cross-env. Уже заданную
 * переменную не перетираем. Проверку TLS это не отключает.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cert = path.join(root, "deploy", "certs", "russian_trusted_root_ca.pem");

const env = { ...process.env };
if (!env.NODE_EXTRA_CA_CERTS) {
  if (existsSync(cert)) env.NODE_EXTRA_CA_CERTS = cert;
  else console.warn(`[next-with-ca] нет файла ${cert}: запросы к Точка Банку не пройдут проверку сертификата`);
}

// Запускаем тот же next, что стоит в проекте, через текущий node: так не
// нужен ни npx, ни оболочка (cmd/bash), и сигналы доходят до процесса
const nextBin = createRequire(path.join(root, "package.json")).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit",
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
