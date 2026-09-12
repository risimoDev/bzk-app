import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { uploadPath } from "@/lib/uploads";
import { PRODUCT_IMAGE_NAME } from "@/lib/product-images";

/**
 * Картинки каталога.
 *
 * В отличие от макетов и фотоотчётов, эти файлы открыты всем: они и есть
 * витрина. Проверки прав тут нет намеренно - есть проверка имени, чтобы
 * маршрут не превратился в чтение произвольного файла с диска.
 *
 * Почему не public: файлы приходят из админки и из скрипта переноса уже
 * после сборки образа, а public в образ вшивается. Подробнее -
 * в комментарии к BUCKETS в lib/uploads.ts.
 */

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/product-image/[name]">,
) {
  const { name } = await ctx.params;

  if (!PRODUCT_IMAGE_NAME.test(name)) {
    return new Response("Файл не найден", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(uploadPath(name, "products"));
  } catch {
    return new Response("Файл не найден", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      // Имя случайное и никогда не переиспользуется: заменённая картинка
      // получает новое имя, поэтому кешировать можно навсегда
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
