/**
 * Контрагенты - заказчики, которых менеджер заводит сам.
 *
 * Чистая часть: словари и разбор строк. Работа с базой - в
 * `counterparties-db.ts`, иначе `pg` уехал бы в браузерный бандл.
 */

/**
 * Телефон, приведённый к цифрам, для поиска и сравнения.
 *
 * В базе телефоны записаны как попало: «+7 (342) 202-52-02», «8-902…»,
 * «89024752020». Чтобы одинаковые номера считались одинаковыми, ведущую
 * восьмёрку заменяем на семёрку - это тот же российский номер.
 */
export function phoneDigits(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

/** Как называть контрагента в списках: организация важнее имени. */
export function counterpartyLabel(c: {
  name: string;
  companyName?: string | null;
}) {
  return c.companyName?.trim() ? `${c.companyName} · ${c.name}` : c.name;
}
