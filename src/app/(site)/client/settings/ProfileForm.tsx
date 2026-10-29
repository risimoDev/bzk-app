"use client";

import { useActionState, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { updateProfile, type ActionState } from "@/app/actions/client";
import { cn } from "@/lib/cn";
import { siteInputClass } from "@/components/ui/form-classes";
import { InnLookup } from "@/components/ui/InnLookup";

const initial: ActionState = { ok: false };

export type Profile = {
  name: string;
  email: string;
  phone: string;
  birthday: string;
  shippingAddress: string;
  isCorporate: boolean;
  companyName: string;
  inn: string;
  kpp: string;
  legalAddress: string;
};

/**
 * Профиль клиента.
 *
 * Реквизиты организации показываются только когда отмечено «заказываю от
 * юрлица»: физлицу эти поля не нужны, а пустой ИНН в форме выглядит как
 * недоделанная анкета.
 */
export function ProfileForm({
  profile,
  innLookup = false,
}: {
  profile: Profile;
  /** Включена ли подсказка реквизитов по ИНН (задан ключ DaData). */
  innLookup?: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const [corporate, setCorporate] = useState(profile.isCorporate);

  return (
    <form action={action} className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
      <h2 className="font-display text-xl text-ink">Личные данные</h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            maxLength={255}
            defaultValue={profile.name}
            className={inputClass}
          />
        </Field>

        <Field label="Почта" htmlFor="email" hint="Адрес входа меняет менеджер - напишите в поддержку">
          <input
            id="email"
            value={profile.email}
            readOnly
            disabled
            className={cn(inputClass, "opacity-60")}
          />
        </Field>

        <Field label="Телефон" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={20}
            defaultValue={profile.phone}
            placeholder="+7 900 000-00-00"
            className={inputClass}
          />
        </Field>

        <Field label="День рождения" htmlFor="birthday" hint="Не обязательно - поздравим и дадим скидку">
          <input
            id="birthday"
            name="birthday"
            type="date"
            defaultValue={profile.birthday}
            className={inputClass}
          />
        </Field>

        <Field label="Адрес доставки" htmlFor="shippingAddress" wide>
          <textarea
            id="shippingAddress"
            name="shippingAddress"
            rows={2}
            defaultValue={profile.shippingAddress}
            placeholder="Куда обычно везти заказ"
            className={cn(inputClass, "resize-y")}
          />
        </Field>
      </div>

      <label className="mt-6 flex cursor-pointer items-center gap-3 text-ink">
        <input
          type="checkbox"
          name="isCorporate"
          checked={corporate}
          onChange={(e) => setCorporate(e.target.checked)}
          className="size-4 accent-brand"
        />
        Заказываю от организации или ИП
      </label>

      {corporate && (
        <div className="mt-4 grid gap-4 border-t border-ink/10 pt-5 sm:grid-cols-2">
          <Field label="Название организации" htmlFor="companyName" wide>
            <input
              id="companyName"
              name="companyName"
              maxLength={255}
              defaultValue={profile.companyName}
              className={inputClass}
            />
          </Field>

          <Field label="ИНН" htmlFor="inn" hint="10 цифр у организации, 12 у предпринимателя">
            <input
              id="inn"
              name="inn"
              inputMode="numeric"
              maxLength={12}
              defaultValue={profile.inn}
              className={cn(inputClass, "font-mono tabular-nums")}
            />
          </Field>

          <Field label="КПП" htmlFor="kpp" hint="У предпринимателя КПП не бывает">
            <input
              id="kpp"
              name="kpp"
              inputMode="numeric"
              maxLength={9}
              defaultValue={profile.kpp}
              className={cn(inputClass, "font-mono tabular-nums")}
            />
          </Field>

          {innLookup && (
            <InnLookup
              variant="site"
              innName="inn"
              className="sm:col-span-2"
              targets={[
                { name: "companyName", label: "Название организации", value: (p) => p.shortName },
                { name: "kpp", label: "КПП", value: (p) => p.kpp },
                { name: "legalAddress", label: "Юридический адрес", value: (p) => p.address },
              ]}
            />
          )}

          <Field label="Юридический адрес" htmlFor="legalAddress" wide>
            <textarea
              id="legalAddress"
              name="legalAddress"
              rows={2}
              defaultValue={profile.legalAddress}
              className={cn(inputClass, "resize-y")}
            />
          </Field>

          <p className="text-sm text-ink/50 sm:col-span-2">
            Эти данные попадают в счёт и закрывающие документы - проверьте их
            по выписке.
          </p>
        </div>
      )}

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

function Field({
  label,
  htmlFor,
  hint,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <label
        htmlFor={htmlFor}
        className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45"
      >
        {label.toUpperCase()}
      </label>
      {children}
      {hint && <p className="text-xs text-ink/40">{hint}</p>}
    </div>
  );
}

const inputClass = siteInputClass;
