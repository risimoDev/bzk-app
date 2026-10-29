/**
 * Проверка значения, пришедшего снаружи (форма, адрес, куки), на
 * принадлежность словарю.
 *
 * Оператор `raw in DICT` смотрит и по цепочке прототипов: «constructor»,
 * «toString» и «__proto__» проходят как «известный статус», а потом
 * падают в базе или рисуют функцию вместо подписи. Object.hasOwn смотрит
 * только собственные ключи. Модуль чистый - его подключают и серверный
 * код, и клиентские компоненты, и проверочные скрипты.
 */

/** Это один из собственных ключей словаря? Сужает тип до ключа. */
export function isKeyOf<T extends object>(dict: T, key: unknown): key is keyof T & string {
  return typeof key === "string" && Object.hasOwn(dict, key);
}

/**
 * Ключ словаря или запасное значение. Для полей формы, где неизвестное
 * значение не ошибка, а «по умолчанию».
 */
export function keyOr<T extends object, F extends keyof T & string>(
  dict: T,
  key: unknown,
  fallback: F,
): keyof T & string {
  return isKeyOf(dict, key) ? key : fallback;
}
