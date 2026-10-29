import { currentUser } from "@/auth";
import { clientIp } from "@/lib/client-ip";
import { findPartyByInn, isDadataEnabled } from "@/lib/dadata";
import { isValidInn, normalizeInn } from "@/lib/inn";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";

/**
 * Реквизиты организации по ИНН: GET /api/suggestions/party?inn=…
 *
 * Работает как посредник к DaData: ключ остаётся на сервере, наружу идут
 * только нужные формам поля (см. PartyInfo). Без ключа DADATA_API_KEY
 * маршрута «нет» - 404, как у планировщика без секрета.
 *
 * Права: достаточно войти. Подсказка нужна и клиенту в профиле, и
 * сотруднику в админке, а сама по себе отдаёт только открытые реестровые
 * данные; защита от перерасхода платного лимита - ограничение частоты по
 * пользователю и по адресу.
 */
export const dynamic = "force-dynamic";

function reply(status: number, message: string, headers?: Record<string, string>) {
  return Response.json({ ok: false, message }, { status, headers });
}

export async function GET(req: Request) {
  if (!isDadataEnabled()) return new Response(null, { status: 404 });

  const user = await currentUser();
  if (!user) return reply(401, "Требуется вход");

  const inn = normalizeInn(new URL(req.url).searchParams.get("inn"));
  // Проверка контрольной суммы дёшева и до обращения к DaData отсекает
  // опечатки: платный запрос на заведомо неверный ИНН не уходит
  if (!isValidInn(inn)) {
    return reply(400, "ИНН - 10 или 12 цифр, проверьте, нет ли опечатки");
  }

  const userKey = `u:${user.id}`;
  const ipKey = `ip:${await clientIp()}`;

  const [byUser, byIp] = await Promise.all([
    checkRateLimit(userKey, "partyLookupUser"),
    checkRateLimit(ipKey, "partyLookupIp"),
  ]);
  if (!byUser.ok || !byIp.ok) {
    const wait = Math.max(byUser.retryAfter, byIp.retryAfter);
    return reply(429, `Слишком много запросов. Попробуйте ${retryAfterText(wait)}`, {
      "Retry-After": String(wait),
    });
  }
  await Promise.all([
    recordAttempt(userKey, "partyLookupUser"),
    recordAttempt(ipKey, "partyLookupIp"),
  ]);

  const found = await findPartyByInn(inn);

  if (found.status === "found") {
    return Response.json({ ok: true, party: found.party });
  }
  if (found.status === "not_found") {
    return reply(404, "По этому ИНН организация не найдена");
  }
  // Подробности сбоя DaData человеку ни к чему
  return reply(502, "Справочник сейчас недоступен. Заполните реквизиты вручную");
}
