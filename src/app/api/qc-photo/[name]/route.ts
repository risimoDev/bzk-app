import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { can } from "@/lib/permissions";
import { uploadPath } from "@/lib/uploads";

/**
 * Фотоотчёт по дефекту.
 *
 * Снимки лежат вне public: на них бывает продукция клиента до отгрузки, и
 * прямая ссылка не должна работать у постороннего. Смотреть их могут те
 * же, кто видит заказы.
 */

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_req: Request, ctx: RouteContext<"/api/qc-photo/[name]">) {
  if (!(await can("orders", "view"))) {
    return new Response("Нет доступа", { status: 403 });
  }

  const { name } = await ctx.params;

  // Имя в базе случайное и состоит из шестнадцатеричных цифр - всё
  // остальное отвергаем, не заглядывая на диск
  if (!/^[0-9a-f]{32}\.(jpg|jpeg|png|webp)$/.test(name)) {
    return new Response("Файл не найден", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(uploadPath(name, "qc"));
  } catch {
    return new Response("Файл не найден", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
