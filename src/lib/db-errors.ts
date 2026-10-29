/**
 * Разбор ошибок PostgreSQL, которые пришли через Drizzle.
 *
 * Drizzle оборачивает ошибку драйвера в свою (`DrizzleQueryError`), а
 * исходная с кодом SQLSTATE лежит в `cause`. Поэтому проверять
 * `error.code` на верхнем уровне мало.
 */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let cur: unknown = error;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === "string") {
      return {
        code: e.code,
        constraint: typeof e.constraint === "string" ? e.constraint : undefined,
      };
    }
    cur = e.cause;
  }
  return null;
}

/**
 * Нарушение уникальности (23505). С `constraint` - только по этому
 * индексу или ограничению: чужое нарушение не должно маскироваться под
 * «такой номер уже есть».
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = pgError(error);
  if (!e || e.code !== "23505") return false;
  return constraint === undefined || e.constraint === constraint;
}
