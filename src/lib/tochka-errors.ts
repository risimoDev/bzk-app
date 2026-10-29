/**
 * Понятная причина сетевой ошибки при обращении к Точка Банку.
 *
 * fetch в Node при любой сетевой беде бросает безликое «fetch failed», а
 * настоящая причина лежит в `error.cause.code`. Раньше администратор видел
 * только «Не удалось связаться с банком: fetch failed» и не мог отличить
 * отсутствие сертификата Минцифры от недоступной сети. Модуль чистый (без
 * сервера и базы), чтобы его проверял скрипт. В текст попадают только код и
 * готовая русская подсказка: заголовков запроса, а с ними и токена, здесь нет.
 */

const CERT_HINT =
  "банк не прошёл проверку сертификата - в Node нет корневого сертификата Минцифры " +
  "(NODE_EXTRA_CA_CERTS=deploy/certs/russian_trusted_root_ca.pem; в Docker он задаётся в Dockerfile, " +
  "для next dev - запуском через npm run dev)";

const HINTS: Record<string, string> = {
  SELF_SIGNED_CERT_IN_CHAIN: CERT_HINT,
  DEPTH_ZERO_SELF_SIGNED_CERT: CERT_HINT,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: CERT_HINT,
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: CERT_HINT,
  UNABLE_TO_GET_ISSUER_CERT: CERT_HINT,
  CERT_UNTRUSTED: CERT_HINT,
  CERT_HAS_EXPIRED: "срок действия сертификата банка или корневого сертификата истёк, либо неверно время на сервере",
  CERT_NOT_YET_VALID: "сертификат банка ещё не действителен - проверьте время на сервере",
  ERR_TLS_CERT_ALTNAME_INVALID: "сертификат выписан не на адрес банка - проверьте TOCHKA_API_URL",
  ENOTFOUND: "не удалось найти адрес банка (DNS) - проверьте TOCHKA_API_URL и сеть сервера",
  EAI_AGAIN: "DNS временно недоступен - проверьте сеть сервера",
  ECONNREFUSED: "банк отказал в соединении - проверьте TOCHKA_API_URL",
  ECONNRESET: "соединение с банком оборвано",
  EHOSTUNREACH: "банк недоступен из сети сервера",
  ENETUNREACH: "сеть до банка недоступна с сервера",
  ETIMEDOUT: "банк не ответил вовремя",
  UND_ERR_CONNECT_TIMEOUT: "банк не ответил вовремя при соединении",
  UND_ERR_HEADERS_TIMEOUT: "банк не ответил вовремя",
};

type WithCause = { code?: unknown; cause?: unknown; message?: unknown; name?: unknown };

/** Код ошибки из самой ошибки или из цепочки причин (глубина ограничена). */
function findCode(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const c = cur as WithCause;
    if (typeof c.code === "string" && c.code) return c.code;
    cur = c.cause;
  }
  return null;
}

/**
 * Текст для TochkaError при сбое сети. Известный код - русская подсказка и
 * сам код в скобках (его можно искать в документации Node), неизвестный -
 * код и исходное сообщение, обрезанное до разумной длины.
 */
export function describeNetworkError(e: unknown): string {
  const name = e && typeof e === "object" ? (e as WithCause).name : null;
  if (name === "TimeoutError" || name === "AbortError") {
    return "банк не ответил за 30 секунд";
  }

  const code = findCode(e);
  if (code && Object.hasOwn(HINTS, code)) return `${HINTS[code]} (${code})`;

  const message = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
  const detail = [code, cause && cause !== message ? cause : message].filter(Boolean).join(": ");
  return detail.slice(0, 200);
}
