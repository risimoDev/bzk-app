import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { orderPromocodes, orders, promocodes } from "@/db/schema";
import { discountFor, type PromoRule } from "@/lib/promocodes";

/** Внутри транзакции у Drizzle свой объект - принимаем и его, и обычный db. */
type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PromoCheck =
  | { ok: true; rule: PromoRule; discount: number }
  | { ok: false; message: string };

export const PROMO_EXHAUSTED_MESSAGE = "Промокод уже использован";
export const PROMO_ALREADY_USED_BY_YOU_MESSAGE = "Вы уже воспользовались этим промокодом";

/**
 * Код нельзя списать: лимит выбран, пока оформлялся заказ, или одноразовый
 * код этот клиент уже применял. Бросается внутри транзакции заказа, чтобы
 * она откатилась целиком; оформление ловит именно эту ошибку и показывает
 * текст у поля промокода. Отдельный класс - чтобы не глотать заодно
 * настоящие сбои базы.
 */
export class PromoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoUnavailableError";
  }
}

/**
 * Есть ли у клиента живой заказ с этим кодом. Отменённые не считаем:
 * заказ не состоялся, и скидка клиенту не досталась.
 */
async function usedByUser(tx: Tx, code: string, userId: number, exceptOrderId?: number) {
  const [row] = await tx
    .select({ id: orders.id })
    .from(orderPromocodes)
    .innerJoin(orders, eq(orders.id, orderPromocodes.orderId))
    .where(
      and(
        eq(sql`upper(${orderPromocodes.promoCode})`, code.toUpperCase()),
        eq(orders.userId, userId),
        // status допускает NULL, а `<>` с NULL даёт NULL - такой заказ
        // выпал бы из подсчёта и код можно было бы применить ещё раз
        sql`${orders.status} is distinct from 'cancelled'`,
        exceptOrderId === undefined ? undefined : ne(orders.id, exceptOrderId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Проверяет код и считает скидку.
 *
 * Все условия проверяются здесь, а не в форме: код приходит из браузера,
 * и «сколько скинуть» решает только сервер. Одна и та же функция зовётся
 * и при показе скидки в корзине, и при оформлении - иначе показанное и
 * записанное разъезжаются.
 */
export async function checkPromocode(
  raw: string,
  subtotal: number,
  opts: { userId?: number; tx?: Tx } = {},
): Promise<PromoCheck> {
  const tx = opts.tx ?? db;
  const code = raw.trim().toUpperCase().slice(0, 50);
  if (code === "") return { ok: false, message: "Введите код" };

  const [row] = await tx
    .select()
    .from(promocodes)
    .where(and(eq(sql`upper(${promocodes.code})`, code), eq(promocodes.isActive, true)))
    .limit(1);

  if (!row) return { ok: false, message: "Такого промокода нет" };

  // Срок действия - календарные дни, а не моменты времени: «до 20
  // января» значит весь двадцатое, а не до полудня. В колонке лежит
  // timestamp, поэтому границы дня считаем сами
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (row.startDate && now < startOfDay(row.startDate)) {
    return { ok: false, message: "Промокод ещё не действует" };
  }
  if (row.endDate && now > endOfDay(row.endDate)) {
    return { ok: false, message: "Срок промокода вышел" };
  }
  if (row.usageLimit !== null && (row.usedCount ?? 0) >= row.usageLimit) {
    return { ok: false, message: PROMO_EXHAUSTED_MESSAGE };
  }
  // Одноразовый - один раз на клиента. Гостю (корзина без входа) сказать
  // заранее нечего: окончательно это решится при оформлении, а оно
  // требует входа
  if (row.isSingleUse && opts.userId !== undefined) {
    if (await usedByUser(tx, row.code, opts.userId)) {
      return { ok: false, message: PROMO_ALREADY_USED_BY_YOU_MESSAGE };
    }
  }

  const min = Number(row.minOrderAmount ?? 0);
  if (min > 0 && subtotal < min) {
    return {
      ok: false,
      message: `Промокод работает от ${min.toFixed(0)} ₽`,
    };
  }

  const rule: PromoRule = {
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    minOrderAmount: row.minOrderAmount,
    maxDiscountAmount: row.maxDiscountAmount,
  };

  const discount = discountFor(rule, subtotal);
  if (discount <= 0) return { ok: false, message: "По этому коду скидки не выходит" };

  return { ok: true, rule, discount };
}

/**
 * Отмечает использование кода. Зовётся той же транзакцией, что и заказ,
 * после записи order_promocodes.
 *
 * checkPromocode смотрит лимит до транзакции, и два заказа, оформленные
 * одновременно, оба видели «осталось одно использование». Поэтому лимит
 * проверяет сам UPDATE: условие и прибавка - одна операция, а строку
 * кода Postgres держит под блокировкой до конца транзакции. Не
 * обновилось ни строки - код выбран, бросаем PromoUnavailableError, и
 * заказ откатывается.
 *
 * Одноразовость проверяем после UPDATE и по той же причине: второй
 * заказ того же клиента ждёт на блокировке строки кода, пока первый не
 * завершится, и затем уже видит его в order_promocodes.
 */
export async function consumePromocode(
  tx: Tx,
  code: string,
  opts: { userId?: number; orderId?: number } = {},
) {
  const updated = await tx
    .update(promocodes)
    .set({ usedCount: sql`coalesce(${promocodes.usedCount}, 0) + 1` })
    .where(
      and(
        eq(sql`upper(${promocodes.code})`, code.toUpperCase()),
        eq(promocodes.isActive, true),
        sql`(${promocodes.usageLimit} is null or coalesce(${promocodes.usedCount}, 0) < ${promocodes.usageLimit})`,
      ),
    )
    .returning({ id: promocodes.id, isSingleUse: promocodes.isSingleUse });

  if (updated.length === 0) throw new PromoUnavailableError(PROMO_EXHAUSTED_MESSAGE);

  if (opts.userId !== undefined && updated.some((r) => r.isSingleUse)) {
    if (await usedByUser(tx, code, opts.userId, opts.orderId)) {
      throw new PromoUnavailableError(PROMO_ALREADY_USED_BY_YOU_MESSAGE);
    }
  }
}
