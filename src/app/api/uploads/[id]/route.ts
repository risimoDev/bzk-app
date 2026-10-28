import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientUploads } from "@/db/schema";
import { currentUser } from "@/auth";
import { uploadPath } from "@/lib/uploads";
import { parseId } from "@/lib/ids";

/**
 * Выдача клиентского файла.
 *
 * Файлы лежат вне public именно ради этой проверки: свой макет клиент
 * скачивает, чужой не видит даже по прямой ссылке. Сотрудникам доступны
 * все - они с этими файлами и работают.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await currentUser();
  if (!user) return new Response("Требуется вход", { status: 401 });

  const { id } = await ctx.params;
  const fileId = parseId(id);
  if (fileId === null) {
    return new Response("Файл не найден", { status: 404 });
  }

  const staff = user.role === "admin" || user.role === "manager";
  const owner = eq(clientUploads.userId, Number(user.id));

  const [row] = await db
    .select()
    .from(clientUploads)
    .where(staff ? eq(clientUploads.id, fileId) : and(eq(clientUploads.id, fileId), owner))
    .limit(1);

  // Чужой файл и несуществующий отвечают одинаково: иначе по коду ответа
  // можно перебрать, какие номера заняты
  if (!row) return new Response("Файл не найден", { status: 404 });

  let path: string;
  try {
    path = uploadPath(row.filename);
  } catch {
    return new Response("Файл не найден", { status: 404 });
  }

  let size: number;
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error("не файл");
    size = s.size;
  } catch {
    return new Response("Файл потерян на диске", { status: 410 });
  }

  // Отдаём потоком: макеты доходят до пятидесяти мегабайт, и держать их
  // целиком в памяти ради одной отдачи незачем
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      // Тип из базы клиентский и ему нельзя доверять: браузер не должен
      // истолковать присланный «image/svg+xml» как страницу с кодом
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
