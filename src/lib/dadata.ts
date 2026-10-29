import "server-only";
import { parseParty, type PartyInfo } from "@/lib/dadata-parse";

/**
 * Поиск организации по ИНН в DaData (findById/party).
 *
 * Без ключа DADATA_API_KEY функция выключена целиком: маршрут отвечает 404,
 * формы не показывают кнопку. Ключ читаем при каждом вызове, а не при
 * загрузке модуля - в сборке его может не быть.
 */

const ENDPOINT = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";

/** DaData обычно отвечает за доли секунды; дольше пяти ждать незачем. */
const TIMEOUT_MS = 5000;

export function isDadataEnabled(): boolean {
  return (process.env.DADATA_API_KEY?.trim() ?? "") !== "";
}

export type PartyLookup =
  | { status: "found"; party: PartyInfo }
  | { status: "not_found" }
  /** Сеть, таймаут, неверный ключ, исчерпанный дневной лимит DaData. */
  | { status: "unavailable" };

/**
 * ИНН должен быть уже проверен вызывающим. Причину сбоя наружу не
 * отдаём: текст ошибки DaData может содержать подробности про наш ключ,
 * в лог пишем только код.
 */
export async function findPartyByInn(inn: string): Promise<PartyLookup> {
  const key = process.env.DADATA_API_KEY?.trim();
  if (!key) return { status: "unavailable" };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${key}`,
      },
      // MAIN - только головная организация: у юрлица с филиалами иначе
      // пришла бы запись с КПП филиала. Для ИП фильтр не нужен.
      body: JSON.stringify(
        inn.length === 10
          ? { query: inn, count: 1, branch_type: "MAIN" }
          : { query: inn, count: 1 },
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[dadata] ответ ${res.status}`);
      return { status: "unavailable" };
    }

    const party = parseParty(await res.json());
    // Пришёл не тот ИНН, что просили, - чужое не подставляем
    return party && party.inn === inn ? { status: "found", party } : { status: "not_found" };
  } catch (e) {
    console.error("[dadata] запрос не удался:", e instanceof Error ? e.name : "ошибка");
    return { status: "unavailable" };
  }
}
