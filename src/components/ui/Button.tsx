import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "solid" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-display " +
  "tracking-wide transition-all duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-bright " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  solid:
    "bg-brand text-bone shadow-press hover:bg-brand-bright hover:-translate-y-0.5 active:translate-y-0",
  outline:
    "border-2 border-current text-ink hover:bg-ink hover:text-bone hover:-translate-y-0.5",
  ghost: "text-ink/70 hover:text-brand hover:bg-ink/5",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[0.95rem]",
  lg: "h-13 px-8 text-lg",
};

type Props = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "solid",
  size = "md",
  className,
  children,
  ...rest
}: Props & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "solid",
  size = "md",
  className,
  children,
}: Props & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </Link>
  );
}
