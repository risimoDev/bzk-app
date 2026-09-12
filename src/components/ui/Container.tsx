import { cn } from "@/lib/cn";

/** Единая горизонтальная сетка сайта. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[76rem] px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}
