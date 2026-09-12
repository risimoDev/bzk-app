import React from "react";
import { cn } from "@/lib/cn";

export type TapeLabelVariant = "light" | "brand" | "dark" | "yellow";
export type TapeLabelTilt = "left" | "right" | "subtle" | "none";
export type TapeLabelSize = "sm" | "md" | "lg";

interface TapeLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: TapeLabelVariant;
  tilt?: TapeLabelTilt;
  size?: TapeLabelSize;
  children: React.ReactNode;
}

/**
 * Кусочек малярного скотча из брендбука «БЗК Принт 2026».
 *
 * Применяется поверх карточек, цен, заголовков и бэйджей: небрежный наклон,
 * рваные края и волокнистая бумажная фактура создают ощущение приклеенного вручную
 * ярлыка.
 */
export function TapeLabel({
  variant = "light",
  tilt = "subtle",
  size = "md",
  className,
  children,
  ...props
}: TapeLabelProps) {
  const tiltClass = {
    left: "tape-tilt-l",
    right: "tape-tilt-r",
    subtle: "tape-tilt",
    none: "",
  }[tilt];

  const sizeClass = {
    sm: "px-2.5 py-0.5 text-[0.68rem] tracking-[0.14em]",
    md: "px-3.5 py-1 text-xs tracking-[0.16em]",
    lg: "px-5 py-1.5 text-sm tracking-[0.2em]",
  }[size];

  const variantClass = {
    light: "bg-[#f5f1e4] text-ink border-y border-[#e2dcce] shadow-[0_2px_6px_rgba(14,20,23,0.18)]",
    brand: "bg-brand-bright/90 text-bone border-y border-brand-bright shadow-[0_2px_6px_rgba(31,90,83,0.28)]",
    dark: "bg-graphite text-ice border-y border-steel shadow-[0_2px_6px_rgba(0,0,0,0.35)]",
    yellow: "bg-[#e8dc88] text-ink border-y border-[#d5c76e] shadow-[0_2px_6px_rgba(14,20,23,0.16)]",
  }[variant];

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center font-display font-bold uppercase select-none transition-transform duration-200",
        "before:absolute before:-left-1.5 before:top-0 before:bottom-0 before:w-1.5 before:bg-inherit before:[clip-path:polygon(100%_0,0_25%,100%_50%,0_75%,100%_100%)]",
        "after:absolute after:-right-1.5 after:top-0 after:bottom-0 after:w-1.5 after:bg-inherit after:[clip-path:polygon(0_0,100%_25%,0_50%,100%_75%,0_100%)]",
        variantClass,
        sizeClass,
        tiltClass,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
