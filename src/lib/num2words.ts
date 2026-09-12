/**
 * Сумма прописью для бухгалтерских документов.
 *
 * В старом коде эта функция была написана наспех и врала на круглых
 * тысячах: 100 000 превращалось в «сто», потому что слово «тысяч»
 * приписывалось только к последней цифре разряда. Миллионы там вообще
 * не поддерживались, а рубли всегда стояли во множественном числе -
 * «1 рублей». Здесь разряды считаются по одному правилу, а падеж
 * подбирается по числу.
 */

const UNITS_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const UNITS_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

/** Разряды: слово в трёх формах и род числительного перед ним. */
const SCALES: { forms: [string, string, string]; feminine: boolean }[] = [
  { forms: ["", "", ""], feminine: false }, // единицы - слово подставляет вызывающий
  { forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
  { forms: ["миллион", "миллиона", "миллионов"], feminine: false },
  { forms: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
];

/**
 * Выбор формы слова по числу: 1 рубль, 2 рубля, 5 рублей.
 * Одиннадцать-девятнадцать всегда берут третью форму.
 */
export function plural(n: number, forms: [string, string, string]) {
  const abs = Math.abs(Math.trunc(n));
  const tail100 = abs % 100;
  if (tail100 >= 11 && tail100 <= 19) return forms[2];
  const tail10 = abs % 10;
  if (tail10 === 1) return forms[0];
  if (tail10 >= 2 && tail10 <= 4) return forms[1];
  return forms[2];
}

/** Группа из трёх цифр словами. */
function tripletToWords(n: number, feminine: boolean) {
  const units = feminine ? UNITS_F : UNITS_M;
  const out: string[] = [];

  if (n >= 100) out.push(HUNDREDS[Math.floor(n / 100)]);
  const tail = n % 100;

  if (tail >= 10 && tail < 20) {
    out.push(TEENS[tail - 10]);
  } else {
    if (tail >= 20) out.push(TENS[Math.floor(tail / 10)]);
    const u = tail % 10;
    if (u > 0) out.push(units[u]);
  }

  return out;
}

/** Целое число словами: 100000 → «сто тысяч». */
export function numberToWords(value: number, feminine = false): string {
  let n = Math.abs(Math.trunc(value));
  if (n === 0) return "ноль";

  // Режем на группы по три цифры, младшая - первой
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;

    const scale = SCALES[i];
    // Род задаёт название разряда: «одна тысяча», но «один миллион».
    // Для единиц род приходит снаружи - там стоит валюта.
    const isFeminine = i === 0 ? feminine : scale.feminine;
    parts.push(...tripletToWords(g, isFeminine));
    if (i > 0) parts.push(plural(g, scale.forms));
  }

  return parts.join(" ");
}

/** Первая буква заглавная - так сумма пишется в УПД и счетах. */
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Сумма прописью в рублях: 1234.5 → «Одна тысяча двести тридцать
 * четыре рубля 50 копеек». Копейки цифрами - так их печатают в
 * первичных документах.
 */
export function rublesInWords(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);

  // Округляем до копеек до разбора: иначе 0.1 + 0.2 даст 29 копеек
  const kopecks = Math.round(abs * 100);
  const rub = Math.floor(kopecks / 100);
  const kop = kopecks % 100;

  const words = numberToWords(rub, false);
  const rubWord = plural(rub, ["рубль", "рубля", "рублей"]);
  const kopWord = plural(kop, ["копейка", "копейки", "копеек"]);

  const text = `${words} ${rubWord} ${String(kop).padStart(2, "0")} ${kopWord}`;
  return (negative ? "минус " : "") + capitalize(text);
}
