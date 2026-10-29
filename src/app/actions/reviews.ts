"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, reviews } from "@/db/schema";
import { currentUser } from "@/auth";
import { audit } from "@/lib/audit";
import { notifyNewReview } from "@/lib/notify";
import { hasReviewableOrder } from "@/lib/reviews-db";

export type ReviewState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Отзыв о товаре.
 *
 * Оставить его может только тот, кто этот товар заказывал и чей заказ
 * уже отправлен, доставлен или завершён (lib/reviews.ts): отзывы «с
 * улицы» на сайте типографии - это спам, а не мнение, а отзыв по
 * отменённому заказу - тем более. Отзыв уходит на модерацию: показывать
 * его сразу нельзя, в админке для этого есть очередь, и о новом отзыве
 * сотрудникам приходит уведомление.
 */
export async function leaveReview(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await currentUser();
  if (!user) return { error: "Чтобы оставить отзыв, войдите в кабинет" };

  const productId = Number(formData.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Товар не найден" };
  }

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { fieldErrors: { rating: "Оценка от 1 до 5" } };
  }

  const message = String(formData.get("message") ?? "").trim().slice(0, 2000);
  if (message.length < 10) {
    return { fieldErrors: { message: "Напишите хотя бы пару предложений" } };
  }

  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return { error: "Товар не найден" };

  const userId = Number(user.id);

  // Право на отзыв даёт заказ, который уже ушёл к клиенту: без этой
  // проверки страницу товара завалили бы отзывами те, кто ничего не
  // получал
  if (!(await hasReviewableOrder(userId, productId))) {
    return {
      error: "Отзыв можно оставить о товаре из заказа, который уже отправлен или завершён",
    };
  }

  const [twin] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)))
    .limit(1);
  if (twin) return { error: "Вы уже оставляли отзыв об этом товаре" };

  const [created] = await db
    .insert(reviews)
    .values({
      userId,
      productId,
      name: user.name ?? "Клиент",
      rating,
      message,
      status: "pending",
    })
    .returning({ id: reviews.id });

  await audit("review.create", { type: "review", id: created.id }, { productId, rating });

  await notifyNewReview({
    productName: product.name,
    clientName: user.name ?? "Клиент",
    rating,
    preview: message,
  });

  revalidatePath(`/catalog/${productId}`);
  revalidatePath("/admin/inbox");

  return {
    ok: true,
    message: "Спасибо. Отзыв появится на странице после проверки менеджером.",
  };
}
