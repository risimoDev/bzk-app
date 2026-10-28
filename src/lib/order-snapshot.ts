/**
 * Снимок заказа на момент оформления.
 *
 * Название товара, его характеристики и реквизиты покупателя меняются, а
 * счёт и УПД по уже оформленному заказу меняться не должны: переименовали
 * товар, убрали его из каталога, клиент сменил ИНН - документ прежних
 * заказов остаётся таким, каким его увидел клиент. Поэтому всё это
 * записывается в заказ при оформлении, а документы читают снимок раньше
 * текущих данных.
 */

/** Предел колонки order_items.item_name. */
const ITEM_NAME_MAX = 255;

/**
 * Название позиции со всеми выбранными характеристиками:
 * «Визитки, Бумага: мелованная 300, Ламинация: матовая».
 * Длиннее колонки не бывает - лишнее обрезается с многоточием.
 */
export function itemSnapshotName(
  name: string,
  options: { attribute: string; value: string }[],
): string {
  const full = [name.trim(), ...options.map((o) => `${o.attribute}: ${o.value}`)].join(", ");
  return full.length <= ITEM_NAME_MAX ? full : `${full.slice(0, ITEM_NAME_MAX - 1).trimEnd()}…`;
}

export type BuyerSnapshotSource = {
  isCorporate: boolean | null;
  companyName: string | null;
  inn: string | null;
  kpp: string | null;
  legalAddress: string | null;
};

/** Поля contact_info с реквизитами покупателя (имена - как у остальных полей JSON). */
export function buyerSnapshot(u: BuyerSnapshotSource) {
  const clean = (v: string | null) => v?.trim() || null;
  return {
    is_corporate: Boolean(u.isCorporate),
    company_name: clean(u.companyName),
    inn: clean(u.inn),
    kpp: clean(u.kpp),
    legal_address: clean(u.legalAddress),
  };
}
