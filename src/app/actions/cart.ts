"use server";

import { revalidatePath } from "next/cache";
import { readCart, writeCart, lineKey, type CartLine } from "@/lib/cart";
import { normalizeQuantity } from "@/lib/product-price";

export async function addToCart(formData: FormData) {
  const productId = Number(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const min = Number(formData.get("minQuantity")) || 1;
  const step = Number(formData.get("multiplicity")) || 1;

  if (!Number.isInteger(productId) || productId <= 0) return;

  // У каждой характеристики своя группа radio: attr-0, attr-1, …
  // Поэтому собираем по префиксу, а не по одному имени.
  const attrs = [...formData.entries()]
    .filter(([key]) => key.startsWith("attr-"))
    .map(([, value]) => Number(value))
    .filter((n) => Number.isInteger(n) && n > 0);

  const line: CartLine = {
    p: productId,
    q: normalizeQuantity(quantity, min, step),
    a: attrs,
  };

  const lines = await readCart();
  const key = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === key);

  // Тот же товар с тем же набором характеристик - не отдельная строка,
  // а увеличение количества
  if (existing) existing.q += line.q;
  else lines.push(line);

  await writeCart(lines);
  revalidatePath("/cart");
}

export async function setQuantity(formData: FormData) {
  const key = String(formData.get("key"));
  const quantity = Number(formData.get("quantity"));
  const min = Number(formData.get("minQuantity")) || 1;
  const step = Number(formData.get("multiplicity")) || 1;

  const lines = await readCart();
  const line = lines.find((l) => lineKey(l) === key);
  if (!line) return;

  line.q = normalizeQuantity(quantity, min, step);
  await writeCart(lines);
  revalidatePath("/cart");
}

export async function removeFromCart(formData: FormData) {
  const key = String(formData.get("key"));
  const lines = (await readCart()).filter((l) => lineKey(l) !== key);
  await writeCart(lines);
  revalidatePath("/cart");
}

export async function clearCart() {
  await writeCart([]);
  revalidatePath("/cart");
}
