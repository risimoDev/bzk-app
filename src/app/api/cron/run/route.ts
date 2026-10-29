import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runCron } from "@/lib/cron-db";

export const dynamic = "force-dynamic";

/**
 * Запуск периодических задач: POST /api/cron/run
 *
 * Зовёт контейнер cron из docker-compose по внутренней сети раз в пять
 * минут. Адрес открыт всему интернету (Caddy проксирует всё подряд),
 * поэтому:
 *
 * - секрета `CRON_SECRET` в окружении нет - маршрута как бы нет (404), а не
 *   «открыто всем»;
 * - заголовок `Authorization: Bearer <секрет>` сверяется за постоянное
 *   время (lib/cron-auth.ts); чужому в ответ - 401 без подробностей;
 * - в ответе только число обработанного, без текстов ошибок: подробности
 *   в логе приложения.
 *
 * Параллельный второй вызов получает `ran: false` и ничего не делает
 * (блокировка в lib/cron-db.ts).
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };

  if (!process.env.CRON_SECRET?.trim()) {
    return new NextResponse(null, { status: 404, headers });
  }
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse(null, { status: 401, headers });
  }

  try {
    const report = await runCron();
    if (!report.ran) return NextResponse.json({ ran: false, reason: report.reason }, { headers });

    return NextResponse.json(
      {
        ran: true,
        tasks: report.tasks.map((t) => ({ name: t.name, ok: t.ok, count: t.count })),
      },
      { headers },
    );
  } catch (e) {
    console.error("[cron] проход не удался:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ran: false, reason: "error" }, { status: 500, headers });
  }
}
