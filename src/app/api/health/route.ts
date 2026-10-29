import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Проверка живости для healthcheck контейнера и deploy/deploy.sh.
 *
 * Адрес открыт всему интернету, поэтому наружу - только итог и код:
 * 200 - всё в порядке, 503 - база не отвечает. Текст ошибки драйвера
 * называл бы хост, пользователя и версию базы, а время работы процесса
 * подсказывает, когда сервер перезапускали (и обновляли). Подробности
 * пишем в лог приложения: `bash deploy/logs.sh`.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" }, { status: 200, headers });
  } catch (error) {
    console.error("[health] база не отвечает:", error);
    return NextResponse.json({ status: "degraded" }, { status: 503, headers });
  }
}
