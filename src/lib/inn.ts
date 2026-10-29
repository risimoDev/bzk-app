/**
 * ИНН: разбор и проверка контрольной суммы.
 *
 * Чистый модуль - его подключают и форма в браузере, и маршрут подсказок,
 * и проверочный скрипт. Схема проверки - из приказа ФНС: у организации
 * (10 цифр) одна контрольная цифра, у предпринимателя (12) - две.
 */

const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function control(digits: number[], weights: number[]) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += digits[i] * weights[i];
  return (sum % 11) % 10;
}

/**
 * Цифры из того, что ввёл человек: пробелы и дефисы из буфера обмена не
 * мешают. Длиннее 12 знаков не режем - такая строка просто не пройдёт
 * проверку, а не превратится молча в чужой ИНН.
 */
export function normalizeInn(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[\s-]/g, "") : "";
}

/** ИНН из 10 или 12 цифр с верной контрольной суммой. */
export function isValidInn(raw: unknown): boolean {
  const s = normalizeInn(raw);
  if (!/^(\d{10}|\d{12})$/.test(s)) return false;

  const d = [...s].map(Number);

  if (d.length === 10) return control(d, W10) === d[9];
  return control(d, W11) === d[10] && control(d, W12) === d[11];
}
