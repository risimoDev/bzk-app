import Link from "next/link";
import { TriangleAlert } from "lucide-react";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

/**
 * Предупреждение о долге клиента старше 15 дней.
 *
 * Только напоминание менеджеру: заказ оно не блокирует и клиенту ничего
 * не отправляет. Без `href` (нет права смотреть финансы) - просто текст.
 * Компонент без хуков: его можно ставить и в серверную страницу, и в
 * клиентскую форму.
 */
export function DebtWarning({
  info,
  href,
  className,
}: {
  info: { n: number; sum: number } | null | undefined;
  href?: string;
  className?: string;
}) {
  if (!info) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink/80 ${className ?? ""}`}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p>
        Есть неоплаченные заказы старше 15 дней на сумму{" "}
        <b className="font-mono tabular-nums">{money.format(info.sum)}</b>
        {info.n > 1 ? ` (заказов: ${info.n})` : ""}.{" "}
        {href && (
          <Link href={href} className="text-brand underline underline-offset-2 hover:text-brand-bright">
            Смотреть долги
          </Link>
        )}
      </p>
    </div>
  );
}
