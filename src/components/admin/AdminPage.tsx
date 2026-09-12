import { cn } from "@/lib/cn";

/** Общая обёртка страницы админки: заголовок, действия и содержимое. */
export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 pb-16 pt-20 sm:px-8 lg:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink/55">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>

      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Плитка с числом. В админке их читают бегло, поэтому цифра крупная. */
export function AdminStat({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "brand" | "warn";
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-bone px-5 py-4">
      <p className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl tabular-nums",
          tone === "brand" && "text-brand",
          tone === "warn" && "text-warn",
          tone === "plain" && "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  );
}

/** Пустое состояние таблицы - без него страница выглядит сломанной. */
export function AdminEmpty({
  title,
  text,
}: {
  title: string;
  text?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink/20 bg-bone/60 px-6 py-12 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {text && <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">{text}</p>}
    </div>
  );
}
