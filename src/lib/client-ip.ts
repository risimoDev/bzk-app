import "server-only";
import { headers } from "next/headers";

/**
 * Адрес посетителя.
 *
 * Caddy дописывает настоящий адрес в конец X-Forwarded-For, поэтому берём
 * последний элемент: первые посетитель может выставить сам, и по ним его
 * счётчик попыток обнулялся бы с каждым запросом.
 *
 * Лежит отдельно от rate-limit.ts потому, что next/headers существует
 * только внутри Next: с ним проверочный скрипт не смог бы подключить
 * сам счётчик.
 */
export async function clientIp() {
  const h = await headers();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return h.get("x-real-ip")?.trim() || "неизвестный-адрес";
}
