import React from "react";
import { cn } from "@/lib/cn";

export type StampVariant = "brand" | "ok" | "warn" | "danger" | "ink";
export type StampShape = "rect" | "pill" | "circle";

interface StampBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StampVariant;
  shape?: StampShape;
  angle?: number;
  children: React.ReactNode;
}

/**
 * Винтажный штемпель контроля качества / стандартов производства.
 *
 * Фактура оттиска чернильного штампа с пунктирным или двойным контуром,
 * характерная для технических документов и брендбука типографии.
 */
export function StampBadge({
  variant = "brand",
  shape = "rect",
  angle = -3.5,
  className,
  children,
  style,
  ...props
}: StampBadgeProps) {
  const variantClass = {
    brand: "text-brand border-brand/60 bg-brand/5",
    ok: "text-ok border-ok/60 bg-ok/5",
    warn: "text-warn border-warn/60 bg-warn/5",
    danger: "text-danger border-danger/60 bg-danger/5",
    ink: "text-ink/75 border-ink/40 bg-ink/5",
  }[variant];

  const shapeClass = {
    rect: "rounded-md px-3 py-1 text-xs border-2 border-dashed",
    pill: "rounded-pill px-4 py-1 text-xs border-2 border-dashed",
    circle: "rounded-full size-20 text-[0.65rem] border-2 border-dashed flex-col text-center p-2",
  }[shape];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-display uppercase tracking-[0.2em] font-bold select-none",
        variantClass,
        shapeClass,
        className,
      )}
      style={{
        transform: `rotate(${angle}deg)`,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
