"use client";

import { useActionState, useState } from "react";
import { Check, Star, TriangleAlert } from "lucide-react";
import { leaveReview, type ReviewState } from "@/app/actions/reviews";
import { cn } from "@/lib/cn";

const initial: ReviewState = {};

/**
 * Отзыв о товаре.
 *
 * Звёзды - обычные radio: так оценка попадает в форму без скриптов и
 * читается с клавиатуры, а картинка звезды остаётся картинкой.
 */
export function ReviewForm({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(leaveReview, initial);
  const [rating, setRating] = useState(5);

  if (state.ok) {
    return (
      <p
        className="flex items-center gap-2 rounded-card border border-ok/30 bg-ok/8 px-5 py-4 text-sm text-ok"
        role="status"
      >
        <Check className="size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form
      action={action}
      className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7"
    >
      <input type="hidden" name="productId" value={productId} />

      <h3 className="font-display text-lg text-ink">Оставить отзыв</h3>
      <p className="mt-1 text-sm text-ink/55">
        Отзыв появится на странице после проверки менеджером.
      </p>

      <fieldset className="mt-4">
        <legend className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
          ОЦЕНКА
        </legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span className="sr-only">{n} из 5</span>
              <Star
                className={cn(
                  "size-6 transition-colors",
                  n <= rating ? "fill-brand text-brand" : "text-ink/20",
                )}
                aria-hidden
              />
            </label>
          ))}
        </div>
        {state.fieldErrors?.rating && (
          <p className="mt-1 text-xs text-danger">{state.fieldErrors.rating}</p>
        )}
      </fieldset>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
          ЧТО СКАЖЕТЕ
        </span>
        <textarea
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="Что заказывали, как прошло, что понравилось или нет"
          className={cn(
            "w-full resize-y rounded-card border bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35",
            "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
            state.fieldErrors?.message ? "border-danger" : "border-ink/15 hover:border-ink/30",
          )}
        />
        {state.fieldErrors?.message && (
          <span className="text-xs text-danger">{state.fieldErrors.message}</span>
        )}
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand px-6 py-2.5 font-display text-sm tracking-wide text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "Отправляем…" : "Отправить"}
        </button>
        {state.error && (
          <span className="flex items-center gap-2 text-sm text-danger" role="status">
            <TriangleAlert className="size-4" aria-hidden />
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
