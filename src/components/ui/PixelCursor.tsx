import React from "react";
import { cn } from "@/lib/cn";

interface PixelCursorProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * 8-битный ретро-пиксельный курсор из коллажа брендбука «БЗК Принт 2026».
 *
 * Создаёт ощущение интерактивности и цифрового крафта: контрастный белый
 * указатель с чёрным ступенчатым пиксельным контуром.
 */
export function PixelCursor({
  size = 36,
  className,
  glow = false,
  ...props
}: PixelCursorProps) {
  return (
    <svg
      width={size}
      height={size * 1.3}
      viewBox="0 0 16 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none select-none inline-block drop-shadow-[2px_3px_6px_rgba(14,20,23,0.45)]",
        glow && "filter drop-shadow-[0_0_8px_rgba(63,162,148,0.6)]",
        className,
      )}
      aria-hidden="true"
      {...props}
    >
      {/* 8-bit retro pixel arrow cursor */}
      <path
        d="M0 0V17L4 13.5L7 20.5L9.5 19.5L6.5 12.5L12 12.5L0 0Z"
        fill="#0E1417"
      />
      <path
        d="M1.5 2.5V14.5L4.5 11.8L7.5 18.5L8.5 18L5.5 11.2L10 11.2L1.5 2.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
