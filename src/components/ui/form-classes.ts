/**
 * Классы полей форм.
 *
 * Раньше одна и та же строка классов была скопирована в 30 файлов, и
 * правка стиля поля означала 30 правок - с неизбежно забытыми. Здесь
 * собраны варианты, которые реально повторялись; редкие поля со своей
 * вёрсткой остались на месте.
 *
 * Строки, а не компоненты: поля в формах разные (input, select, textarea)
 * и часто дополняются своими классами через `cn`.
 */

const focus = "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";

/** Витрина: подпись над полем - по брендбуку, капителью. */
export const siteLabelClass = "font-display text-[0.68rem] tracking-[0.16em] text-ink/45";

/** Витрина: крупное поле со скруглением карточки. */
export const siteInputClass =
  `w-full rounded-card border border-ink/15 bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 ${focus}`;

/** Админка: подпись над полем - мельче, плотная вёрстка. */
export const adminLabelClass = "font-display text-[0.62rem] tracking-[0.16em] text-ink/45";

/** Админка: поле на светлой карточке. */
export const adminInputClass =
  `w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 ${focus}`;

/** Админка: поле на карточке цвета paper - фон поля светлее подложки. */
export const adminInputOnPaperClass =
  `w-full rounded-lg border border-ink/15 bg-bone px-3 py-2 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 ${focus}`;

/** Админка: низкое поле в строке списка - справочники, ступени цен. */
export const adminInlineInputClass =
  `rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 ${focus}`;
