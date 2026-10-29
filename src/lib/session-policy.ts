/**
 * Правила жизни сессии: отзыв по версии и срок для сотрудников.
 *
 * Сессия лежит в JWT и сама по себе не отзывается: выйти «отовсюду» значит
 * сделать так, чтобы уже выданные токены перестали проходить проверку.
 * Для этого у пользователя есть счётчик `users.session_version`; токен
 * запоминает его значение при входе, а колбэк `session` в `src/auth.ts`
 * сверяет с базой - там пользователь и так читается на каждый вызов, так
 * что лишнего запроса это не стоит. Счётчик растёт при смене и сбросе
 * пароля, отключении второго фактора, блокировке и по кнопке «Выйти со
 * всех устройств».
 *
 * Модуль чистый (без базы и `@/auth`), чтобы его проверял скрипт.
 */

/** Сотрудник входит заново не реже раза в неделю; клиент - как раньше (30 дней). */
export const STAFF_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Версия в токене совпадает с текущей в базе?
 *
 * Токены, выданные до появления счётчика, версии не несут - считаем их
 * нулевой, как и значение по умолчанию в базе: у кого счётчик не трогали,
 * не вылетит из сессии ни с того ни с сего.
 */
export function sessionVersionMatches(
  tokenVersion: unknown,
  currentVersion: number | null | undefined,
) {
  const inToken = typeof tokenVersion === "number" ? tokenVersion : 0;
  return inToken === (currentVersion ?? 0);
}

/**
 * Вышел ли срок сессии сотрудника. Отсчёт - от момента входа в токене, а не
 * от последнего обращения: Auth.js продлевает токен при каждом запросе, и
 * считать от него значило бы никогда не просрочить. Нет отметки входа
 * (токен выдан до этого правила) - сотрудник войдёт заново один раз.
 */
export function staffSessionExpired(
  role: string | null | undefined,
  loginAt: unknown,
  now = Date.now(),
) {
  if (role === "user" || role === null || role === undefined) return false;
  if (typeof loginAt !== "number" || !Number.isFinite(loginAt)) return true;
  return now - loginAt > STAFF_SESSION_MAX_AGE_MS;
}

/** Сводное решение: токен больше не действует. */
export function sessionRevoked(input: {
  /** Роль из базы, а не из токена: повышенного до сотрудника это тоже касается. */
  role: string | null | undefined;
  tokenVersion: unknown;
  currentVersion: number | null | undefined;
  loginAt: unknown;
  now?: number;
}) {
  return (
    !sessionVersionMatches(input.tokenVersion, input.currentVersion) ||
    staffSessionExpired(input.role, input.loginAt, input.now)
  );
}
