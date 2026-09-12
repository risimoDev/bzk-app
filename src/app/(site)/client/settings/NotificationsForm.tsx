"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { updateNotifications, type ActionState } from "@/app/actions/client";
import { cn } from "@/lib/cn";

const initial: ActionState = { ok: false };

export type NotificationPrefs = {
  email: boolean;
  sms: boolean;
  telegram: boolean;
  newsletter: boolean;
};

const CHANNELS = [
  {
    name: "emailNotifications",
    key: "email",
    label: "Почта",
    text: "Смена статуса заказа, счета и закрывающие документы",
  },
  {
    name: "smsNotifications",
    key: "sms",
    label: "СМС",
    text: "Только важное: заказ готов, курьер выехал",
  },
  {
    name: "telegramNotifications",
    key: "telegram",
    label: "Телеграм",
    text: "То же, что на почту, но быстрее",
  },
  {
    name: "newsletter",
    key: "newsletter",
    label: "Новости и акции",
    text: "Редко и по делу - сезонные предложения и новые услуги",
  },
] as const;

export function NotificationsForm({
  prefs,
  telegramLinked,
}: {
  prefs: NotificationPrefs;
  telegramLinked: boolean;
}) {
  const [state, action, pending] = useActionState(updateNotifications, initial);

  return (
    <form action={action} className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
      <h2 className="font-display text-xl text-ink">Уведомления</h2>

      <ul className="mt-5 flex flex-col gap-4">
        {CHANNELS.map((c) => (
          <li key={c.name}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={c.name}
                defaultChecked={prefs[c.key]}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <span className="block text-ink">{c.label}</span>
                <span className="block text-sm text-ink/50">{c.text}</span>
                {c.key === "telegram" && !telegramLinked && (
                  <span className="mt-1 block text-sm text-warn">
                    Телеграм пока не привязан - включите галочку и напишите нашему боту,
                    он свяжет аккаунт.
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
        </button>

        {state.message && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm",
              state.ok ? "text-ok" : "text-danger",
            )}
            role="status"
          >
            {state.ok ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <TriangleAlert className="size-4" aria-hidden />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
