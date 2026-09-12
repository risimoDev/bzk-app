import type { Metadata } from "next";
import { asc, desc, count, sql } from "drizzle-orm";
import { Ticket, EyeOff } from "lucide-react";
import { db } from "@/db";
import { promocodes, orderPromocodes } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { PromoToggle } from "./PromoToggle";
import { PromoForm } from "./PromoForm";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Промокоды · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** Скидка словами: процент или фиксированная сумма. */
function discountLabel(type: string | null, value: string | null) {
  const v = Number(value ?? 0);
  return type === "percentage" ? `−${v}%` : `−${money.format(v)}`;
}

export default async function AdminPromocodes() {
  if (!(await can("settings", "view"))) {
    return (
      <AdminPage title="Промокоды">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть настройки." />
      </AdminPage>
    );
  }

  const [rows, applied] = await Promise.all([
    db.select().from(promocodes).orderBy(desc(promocodes.isActive), asc(promocodes.code)),
    // Сколько скидки промокоды реально дали: used_count считает применения,
    // но не сумму. Связь здесь по самому коду, а не по номеру записи -
    // в заказе сохраняется строка промокода на момент оформления
    db
      .select({
        code: orderPromocodes.promoCode,
        n: count(),
        total: sql<string>`coalesce(sum(${orderPromocodes.appliedDiscount}), 0)`,
      })
      .from(orderPromocodes)
      .groupBy(orderPromocodes.promoCode),
  ]);

  const canEdit = await can("settings", "edit");
  const canCreate = await can("settings", "create");
  const usage = new Map(
    applied.map((a) => [a.code, { n: Number(a.n), total: Number(a.total) }]),
  );

  const active = rows.filter((r) => r.isActive).length;
  const totalUses = rows.reduce((s, r) => s + (r.usedCount ?? 0), 0);
  const totalDiscount = applied.reduce((s, a) => s + Number(a.total), 0);

  return (
    <AdminPage title="Промокоды" subtitle="Скидочные коды и их использование">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Всего кодов" value={String(rows.length)} />
        <AdminStat label="Работают" value={String(active)} tone="brand" />
        <AdminStat
          label="Применений"
          value={String(totalUses)}
          hint="по счётчику у кода"
        />
        <AdminStat
          label="Скидок выдано"
          value={money.format(totalDiscount)}
          hint="по записям в заказах"
        />
      </div>

      {canCreate && (
        <div className="mt-6">
          <PromoForm />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty title="Кодов нет" />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((p) => {
            const use = usage.get(p.code);
            const limitLeft =
              p.usageLimit !== null ? p.usageLimit - (p.usedCount ?? 0) : null;

            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-xl border border-ink/10 bg-bone px-5 py-4",
                  !p.isActive && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                  <div className="min-w-56 flex-1">
                    <span className="flex flex-wrap items-center gap-2.5">
                      <span className="flex items-center gap-2 font-mono text-ink">
                        <Ticket className="size-4 text-ink/35" aria-hidden />
                        {p.code}
                      </span>
                      <span className="rounded bg-brand/12 px-2 py-0.5 font-display text-[0.6rem] tracking-wider text-brand">
                        {discountLabel(p.discountType, p.discountValue)}
                      </span>
                      {!p.isActive && (
                        <span className="flex items-center gap-1 text-xs text-ink/45">
                          <EyeOff className="size-3" aria-hidden />
                          выключен
                        </span>
                      )}
                      {p.isSingleUse && (
                        <span className="text-xs text-ink/45">одноразовый</span>
                      )}
                    </span>

                    {p.description && (
                      <p className="mt-1 text-sm text-ink/60">{p.description}</p>
                    )}

                    <p className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-ink/45">
                      <span>применён {p.usedCount ?? 0} раз</span>
                      {use && <span>на {money.format(use.total)}</span>}
                      {limitLeft !== null && (
                        <span className={cn(limitLeft <= 0 && "text-warn")}>
                          {limitLeft > 0 ? `осталось ${limitLeft}` : "лимит исчерпан"}
                        </span>
                      )}
                      {p.minOrderAmount && (
                        <span>от {money.format(Number(p.minOrderAmount))}</span>
                      )}
                      {p.maxDiscountAmount && (
                        <span>не больше {money.format(Number(p.maxDiscountAmount))}</span>
                      )}
                      {p.startDate && <span>с {dt.format(p.startDate)}</span>}
                      {p.endDate && <span>до {dt.format(p.endDate)}</span>}
                    </p>
                  </div>

                  {canEdit && <PromoToggle promoId={p.id} active={p.isActive === true} />}
                </div>

                {canEdit && (
                  <details className="mt-3 border-t border-ink/8 pt-3">
                    <summary className="cursor-pointer text-xs text-brand hover:text-brand-bright">
                      изменить условия
                    </summary>
                    <div className="mt-3">
                      <PromoForm
                        value={{
                          id: p.id,
                          code: p.code,
                          discountType: p.discountType,
                          discountValue: p.discountValue,
                          minOrderAmount: p.minOrderAmount,
                          maxDiscountAmount: p.maxDiscountAmount,
                          usageLimit: p.usageLimit,
                          startDate: p.startDate,
                          endDate: p.endDate,
                          description: p.description,
                          isSingleUse: p.isSingleUse,
                          isActive: p.isActive,
                        }}
                      />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 max-w-2xl text-xs text-ink/45">
        Коды не удаляются: по ним уже оформлены заказы, и без записи о коде
        расчёт в них перестанет сходиться. Ненужный код выключается. Счётчик
        применений перенесён со старого сайта вместе с кодами - те
        использования были настоящими, и обнулять его значило бы выдать
        разовые коды заново.
      </p>
    </AdminPage>
  );
}
