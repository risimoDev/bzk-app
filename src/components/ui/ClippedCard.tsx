import React from "react";
import { cn } from "@/lib/cn";
import { Decor, clip } from "@/components/ui/Collage";

export type ClipType = "mint" | "steel" | "binder" | "none";
export type ClipPosition = "top-left" | "top-right";

interface ClippedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  clipType?: ClipType;
  clipPosition?: ClipPosition;
  tilt?: boolean;
  paper?: "light" | "dark" | "mint";
  children: React.ReactNode;
}

/**
 * Карточка-лист бумаги, прикреплённая скрепкой.
 *
 * Точное воспроизведение титульного листа и обложки из брендбука:
 * поверх тёмного фона секции лежит светлый лист бумаги с бумажной фактурой,
 * зафиксированный скрепкой (металлической или мятно-бирюзовой).
 */
export function ClippedCard({
  clipType = "mint",
  clipPosition = "top-left",
  tilt = false,
  paper = "light",
  className,
  children,
  ...props
}: ClippedCardProps) {
  const paperClass = {
    light: "paper-light text-ink border border-ink/10 shadow-lift",
    dark: "paper-dark text-bone grain border border-ink/30 shadow-lift",
    mint: "paper-mint text-ink border border-brand/20 shadow-lift",
  }[paper];

  const clipAsset = {
    mint: clip.mint,
    steel: clip.steel,
    binder: clip.binder,
    none: null,
  }[clipType];

  return (
    <div className="relative group">
      {clipAsset && (
        <div
          className={cn(
            "absolute z-20 pointer-events-none select-none drop-shadow-md transition-transform duration-300 group-hover:scale-105",
            clipPosition === "top-left" && "-top-5 left-6 -rotate-6",
            clipPosition === "top-right" && "-top-5 right-6 rotate-12",
          )}
        >
          <Decor
            asset={clipAsset}
            className={cn(
              clipType === "binder" ? "w-11" : "w-7 sm:w-8",
            )}
          />
        </div>
      )}

      <div
        className={cn(
          "rounded-card p-6 sm:p-8 relative overflow-hidden transition-all duration-300",
          tilt && "tape-tilt",
          paperClass,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}
