/**
 * Проверка правила итога инспекции.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-quality.mjs
 *
 * Правило одно, но от него зависит, уйдёт партия клиенту или нет:
 * непройденный критический пункт - брак, непройденный обычный -
 * замечания, «не применимо» на итог не влияет.
 */
import { overallResult, passRate } from "../src/lib/quality.ts";

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "✓" : "✗"} ${name} - ${got}${ok ? "" : ` (ждали ${want})`}`);
  if (!ok) failed++;
};

const ok = (critical = false) => ({ status: "ok", critical });
const fail = (critical = false) => ({ status: "fail", critical });
const na = (critical = false) => ({ status: "na", critical });

check("пустой список - принято", overallResult([]), "passed");
check("всё в норме - принято", overallResult([ok(), ok(true)]), "passed");
check("провал обычного - замечания", overallResult([ok(true), fail()]), "partial");
check("провал критического - брак", overallResult([fail(true), ok()]), "failed");
check(
  "критический перевешивает обычные",
  overallResult([fail(), fail(), fail(true)]),
  "failed",
);
check("«не применимо» итог не портит", overallResult([na(true), ok()]), "passed");
check(
  "«не применимо» на критическом - не брак",
  overallResult([na(true), fail()]),
  "partial",
);
check(
  "порядок пунктов не важен",
  overallResult([ok(), fail(true), fail()]),
  "failed",
);

check("доля принятых: 0 из 0", passRate(0, 0), 0);
check("доля принятых: 9 из 10", passRate(9, 10), 90);
check("доля принятых: 1 из 3", passRate(1, 3), 33.3);
check("доля принятых: 3 из 3", passRate(3, 3), 100);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
