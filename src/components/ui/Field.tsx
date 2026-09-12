import { cn } from "@/lib/cn";

/**
 * Поле формы с подписью и сообщением об ошибке.
 *
 * Ошибка связана с полем через aria-describedby и aria-invalid, иначе
 * экранная читалка объявит «поле почта» и умолчит о том, что в нём не так.
 */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-display text-xs tracking-[0.16em] text-ink/50"
      >
        {label}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        className: cn(
          "w-full rounded-xl border bg-bone px-4 py-3 text-ink",
          "placeholder:text-ink/30",
          "focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
          error ? "border-danger" : "border-ink/15 hover:border-ink/30",
        ),
      })}

      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="text-sm text-ink/45">
          {hint}
        </p>
      )}
    </div>
  );
}
