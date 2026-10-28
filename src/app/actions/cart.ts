"use server";

import { revalidatePath } from "next/cache";
import {
  readCart,
  writeCart,
  lineKey,
  cartProduct,
  validCartLines,
  MAX_CART_QUANTITY,
  type CartLine,
} from "@/lib/cart";
import { normalizeQuantity, pickAttributeValues } from "@/lib/product-price";
import { parseId } from "@/lib/ids";

export type CartState = { ok?: boolean; error?: string; message?: string };

export async function addToCart(_prev: CartState, formData: FormData): Promise<CartState> {
  const productId = parseId(formData.get("productId"));
  if (productId === null) return { error: "Товар не найден" };

  // Минимальный тираж и шаг - из базы. Раньше они приходили скрытыми
  // полями формы, и «продаём сотнями» обходилось их правкой
  const product = await cartProduct(productId);
  if (!product || product.isHidden) return { error: "Этот товар сейчас не продаётся" };

  // У каждой характеристики своя группа radio: attr-0, attr-1, …
  // Поэтому собираем по префиксу, а не по одному имени.
  const chosen = [...formData.entries()]
    .filter(([key]) => key.startsWith("attr-"))
    .map(([, value]) => parseId(value))
    .filter((n): n is number => n !== null);

  const attrs = pickAttributeValues(chosen, product.options);
  if (!attrs) return { error: "Выберите все характеристики" };

  const line: CartLine = {
    p: productId,
    q: Math.min(
      normalizeQuantity(Number(formData.get("quantity")), product.minQuantity, product.multiplicity),
      MAX_CART_QUANTITY,
    ),
    a: attrs,
  };

  const lines = await readCart();
  const key = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === key);

  // Тот же товар с тем же набором характеристик - не отдельная строка,
  // а увеличение количества
  if (existing) existing.q = Math.min(existing.q + line.q, MAX_CART_QUANTITY);
  else lines.push(line);

  await writeCart(lines);
  revalidatePath("/cart");
  return { ok: true, message: "Добавлено в корзину" };
}

export async function setQuantity(formData: FormData) {
  const key = String(formData.get("key"));
  const quantity = Number(formData.get("quantity"));

  const lines = await readCart();
  const line = lines.find((l) => lineKey(l) === key);
  if (!line) return;

  // Скрытый или удалённый товар resolveCart и так не покажет - менять нечего
  const product = await cartProduct(line.p);
  if (!product) return;

  line.q = Math.min(
    normalizeQuantity(quantity, product.minQuantity, product.multiplicity),
    MAX_CART_QUANTITY,
  );
  await writeCart(lines);
  revalidatePath("/cart");
}

export async function removeFromCart(formData: FormData) {
  const key = String(formData.get("key"));
  const lines = (await readCart()).filter((l) => lineKey(l) !== key);
  await writeCart(lines);
  revalidatePath("/cart");
}

/**
 * Выбрасывает из куки строки, которые корзина уже не показывает: товар
 * скрыт или у него поменялись характеристики. Отдельное действие, потому
 * что страница корзины - серверный компонент, а он писать куки не может.
 */
export async function pruneCart() {
  const lines = await readCart();
  await writeCart(await validCartLines(lines));
  revalidatePath("/cart");
}

export async function clearCart() {
  await writeCart([]);
  revalidatePath("/cart");
}
