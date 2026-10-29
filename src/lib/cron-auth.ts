import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Проверка секрета планировщика.
 *
 * Заголовок `Authorization: Bearer <секрет>`. Сравнение за постоянное
 * время: обычное `===` останавливается на первом несовпавшем символе, и по
 * времени ответа секрет можно подбирать по буквам. Оба значения сначала
 * хешируются - у `timingSafeEqual` строки обязаны быть одной длины, а
 * голая проверка длины сама выдала бы длину секрета.
 *
 * Пустой секрет не принимает ничего: без него маршрут не должен работать
 * вовсе, а не пускать всех с пустым заголовком.
 */
export function cronAuthorized(header: string | null, secret: string | undefined) {
  const expected = secret?.trim();
  if (!expected) return false;

  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  if (!match) return false;

  const a = createHash("sha256").update(match[1]).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
