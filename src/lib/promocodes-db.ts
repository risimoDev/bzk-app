import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { promocodes } from "@/db/schema";
import { discountFor, type PromoRule } from "@/lib/promocodes";

/** Внутри транзакции у Drizzle свой объект - принимаем и его, и обычный db. */
type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PromoCheck =
  | { ok: true; rule: PromoRule; discount: number }
  | { ok: false; message: string };

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
  tx: Tx = db,
): Promise<PromoCheck> {
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
    return { ok: false, message: "Промокод уже использован" };
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

/** Отмечает использование кода. Зовётся той же транзакцией, что и заказ. */
export async function consumePromocode(tx: Tx, code: string) {
  await tx
    .update(promocodes)
    .set({ usedCount: sql`${promocodes.usedCount} + 1` })
    .where(eq(sql`upper(${promocodes.code})`, code.toUpperCase()));
}
