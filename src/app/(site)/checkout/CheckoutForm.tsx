"use client";

import { useActionState, useState } from "react";
import { Check, Ticket, TriangleAlert } from "lucide-react";
import {
  applyPromocode,
  placeOrder,
  type CheckoutState,
  type PromoState,
} from "@/app/actions/checkout";
import { URGENT_RATE } from "@/lib/promocodes";
import { cn } from "@/lib/cn";

const initial: CheckoutState = {};
const promoInitial: PromoState = {};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

export type CheckoutDefaults = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

/**
 * Оформление заказа.
 *
 * Итог считается на лету, чтобы человек видел, во что обойдётся
 * срочность и промокод, - но окончательную сумму считает сервер по
 * ценам из базы, а не по тому, что показано здесь.
 */
export function CheckoutForm({
  subtotal,
  defaults,
}: {
  subtotal: number;
  defaults: CheckoutDefaults;
}) {
  const [state, action, pending] = useActionState(placeOrder, initial);
  const [promo, promoAction, promoPending] = useActionState(
    applyPromocode,
    promoInitial,
  );

  const [isUrgent, setUrgent] = useState(false);
  const [code, setCode] = useState("");

  const fee = isUrgent ? Math.round(subtotal * URGENT_RATE * 100) / 100 : 0;
  // Скидку показываем только пока условия те же, при которых её считали:
  // включённая срочность меняет базу, и старое число врало бы
  const discount = promo.ok && promo.code === code.trim().toUpperCase()
    ? (promo.discount ?? 0)
    : 0;
  const total = Math.max(0, subtotal + fee - discount);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <form
        id="checkout"
        action={action}
        className="flex flex-col gap-5 rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-8"
      >
        <input type="hidden" name="isUrgent" value={isUrgent ? "1" : "0"} />
        <input type="hidden" name="promoCode" value={discount > 0 ? code : ""} />

        <h2 className="font-display text-xl text-ink">Куда и кому</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="ИМЯ" error={state.fieldErrors?.name}>
            <input
              name="name"
              defaultValue={defaults.name}
              maxLength={100}
              className={input(state.fieldErrors?.name)}
            />
          </Field>

          <Field label="ТЕЛЕФОН" error={state.fieldErrors?.phone}>
            <input
              name="phone"
              type="tel"
              defaultValue={defaults.phone}
              maxLength={20}
              placeholder="+7 (902) 000-00-00"
              className={input(state.fieldErrors?.phone)}
            />
          </Field>

          <Field label="ПОЧТА" error={state.fieldErrors?.email} span>
            <input
              name="email"
              type="email"
              defaultValue={defaults.email}
              maxLength={255}
              className={input(state.fieldErrors?.email)}
            />
          </Field>

          <Field
            label="АДРЕС ДОСТАВКИ"
            error={state.fieldErrors?.address}
            hint="Или напишите «самовывоз» и адрес, куда подъедете"
            span
          >
            <input
              name="address"
              defaultValue={defaults.address}
              maxLength={500}
              placeholder="Пермь, ул. Энергетиков, 9"
              className={input(state.fieldErrors?.address)}
            />
          </Field>

          <Field label="КОММЕНТАРИЙ" error={state.fieldErrors?.comment} span>
            <textarea
              name="comment"
              rows={3}
              maxLength={1000}
              placeholder="Что важно знать про заказ: сроки, макет, кто принимает"
              className={cn(input(state.fieldErrors?.comment), "resize-y")}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-ink/12 bg-paper/60 p-4">
          <input
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setUrgent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-brand"
          />
          <span>
            <span className="block text-ink">Срочный заказ</span>
            <span className="block text-sm text-ink/55">
              Двигаем в начало очереди. Надбавка - половина стоимости,{" "}
              {money.format(Math.round(subtotal * URGENT_RATE * 100) / 100)}
            </span>
          </span>
        </label>

        {state.error && (
          <p
            className="flex items-start gap-2 rounded-card bg-danger/10 px-4 py-3 text-sm text-danger"
            role="status"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}
      </form>

      {/* ------------------------------------------------------- итог */}
      <aside className="rounded-card bg-ink p-7 text-bone shadow-lift grain lg:sticky lg:top-24">
        <h2 className="relative font-display text-sm tracking-[0.2em] text-ice/50">
          Итого
        </h2>

        <dl className="relative mt-6 flex flex-col gap-3 text-sm">
          <Row label="Позиции" value={money.format(subtotal)} />
          {fee > 0 && <Row label="Срочность" value={`+ ${money.format(fee)}`} />}
          {discount > 0 && (
            <Row label={`Промокод ${promo.code}`} value={`− ${money.format(discount)}`} tone="ok" />
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-ice/12 pt-4">
            <dt className="text-ice/60">К оплате</dt>
            <dd className="font-mono text-2xl text-brand-bright">
              {money.format(total)}
            </dd>
          </div>
        </dl>

        {/* Промокод - отдельная форма: она проверяет код, не отправляя заказ */}
        <form action={promoAction} className="relative mt-6 flex flex-col gap-2">
          <input type="hidden" name="isUrgent" value={isUrgent ? "1" : "0"} />
          <label
            htmlFor="promoCode"
            className="font-display text-[0.62rem] tracking-[0.16em] text-ice/45"
          >
            ПРОМОКОД
          </label>
          <div className="flex gap-2">
            <input
              id="promoCode"
              name="promoCode"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={50}
              placeholder="Если есть"
              className="min-w-0 flex-1 rounded-pill border border-ice/25 bg-transparent px-4 py-2 text-sm text-bone placeholder:text-ice/35 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
            />
            <button
              type="submit"
              disabled={promoPending}
              className="flex items-center gap-1.5 rounded-pill border border-ice/25 px-4 py-2 text-sm text-ice/80 transition-colors hover:border-brand-bright hover:text-brand-bright disabled:opacity-50"
            >
              <Ticket className="size-4" aria-hidden />
              {promoPending ? "…" : "Проверить"}
            </button>
          </div>
          {promo.message && (
            <span
              className={cn(
                "flex items-start gap-1.5 text-xs",
                promo.ok ? "text-ok" : "text-danger",
              )}
              role="status"
            >
              {promo.ok && <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
              {promo.message}
            </span>
          )}
        </form>

        <p className="relative mt-5 text-xs leading-relaxed text-ice/45">
          Доставка считается отдельно - зависит от адреса и объёма. После
          оформления менеджер свяжется и подтвердит сроки.
        </p>

        <button
          type="submit"
          form="checkout"
          disabled={pending}
          className="relative mt-6 w-full rounded-pill bg-brand px-6 py-3 font-display text-sm tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "ОФОРМЛЯЕМ…" : "ОФОРМИТЬ ЗАКАЗ"}
        </button>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ice/60">{label}</dt>
      <dd className={cn("font-mono", tone === "ok" ? "text-ok" : "text-ice/90")}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  span,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", span && "sm:col-span-2")}>
      <span className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-ink/45">{hint}</span>
      ) : null}
    </label>
  );
}

const input = (error?: string) =>
  cn(
    "w-full rounded-card border bg-bone px-4 py-3 text-sm text-ink placeholder:text-ink/35",
    "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
    error ? "border-danger" : "border-ink/15 hover:border-ink/30",
  );
