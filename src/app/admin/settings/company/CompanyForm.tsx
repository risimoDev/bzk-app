"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { saveCompany, type CompanyFormState } from "@/app/actions/company";
import { COMPANY_FIELDS, COMPANY_HINTS, type Company, type CompanyField } from "@/lib/company";
import { cn } from "@/lib/cn";

/** Поля сгруппированы так, как их переписывают из выписки и из банка. */
const GROUPS: { title: string; note?: string; fields: CompanyField[] }[] = [
  {
    title: "Организация",
    note: "Попадает в шапку счёта и в графы «Продавец» универсального передаточного документа.",
    fields: [
      "company_name",
      "company_short_name",
      "company_inn",
      "company_kpp",
      "company_ogrn",
      "company_address",
    ],
  },
  {
    title: "Контакты и подписи",
    note: "Фамилии из этого блока печатаются в строках подписей.",
    fields: ["company_phone", "company_email", "company_director", "company_accountant"],
  },
  {
    title: "Банковские реквизиты",
    note: "Без них не строится платёжный QR-код на счёте.",
    fields: [
      "company_bank_name",
      "company_bank_bic",
      "company_bank_account",
      "company_bank_corr_account",
    ],
  },
];

const MONO: CompanyField[] = [
  "company_inn",
  "company_kpp",
  "company_ogrn",
  "company_bank_bic",
  "company_bank_account",
  "company_bank_corr_account",
];

const WIDE: CompanyField[] = ["company_name", "company_address", "company_bank_name"];

const initial: CompanyFormState = { ok: false };

export function CompanyForm({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveCompany, initial);

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {GROUPS.map((group) => (
        <fieldset
          key={group.title}
          className="rounded-xl border border-ink/10 bg-bone px-5 py-4"
          disabled={!canEdit || pending}
        >
          <legend className="px-1 font-display text-[0.62rem] tracking-[0.18em] text-ink/45">
            {group.title.toUpperCase()}
          </legend>
          {group.note && <p className="mb-3 text-xs text-ink/50">{group.note}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              const error = state.errors?.[field];
              return (
                <div
                  key={field}
                  className={cn("flex flex-col gap-1.5", WIDE.includes(field) && "sm:col-span-2")}
                >
                  <label
                    htmlFor={field}
                    className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45"
                  >
                    {COMPANY_FIELDS[field]}
                  </label>
                  <input
                    id={field}
                    name={field}
                    defaultValue={company[field]}
                    maxLength={255}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${field}-error` : undefined}
                    inputMode={MONO.includes(field) ? "numeric" : undefined}
                    className={cn(
                      "w-full rounded-lg border bg-paper px-3 py-2 text-sm text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright disabled:opacity-60",
                      MONO.includes(field) && "font-mono tabular-nums",
                      error ? "border-danger" : "border-ink/15",
                    )}
                  />
                  {error ? (
                    <p id={`${field}-error`} className="text-xs text-danger">
                      {error}
                    </p>
                  ) : (
                    COMPANY_HINTS[field] && (
                      <p className="text-xs text-ink/40">{COMPANY_HINTS[field]}</p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {state.message && (
        <p
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm",
            state.ok ? "bg-ok/12 text-ok" : "bg-danger/12 text-danger",
          )}
          role="status"
        >
          {state.ok ? (
            <Check className="size-4 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
          )}
          {state.message}
        </p>
      )}

      {canEdit && (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone hover:bg-brand-bright disabled:opacity-60"
          >
            {pending ? "СОХРАНЯЮ…" : "СОХРАНИТЬ"}
          </button>
        </div>
      )}
    </form>
  );
}
