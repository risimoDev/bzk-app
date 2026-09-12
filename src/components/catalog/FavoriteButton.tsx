"use client";

import { useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import {
  subscribeFavorites,
  getFavoritesSnapshot,
  getFavoritesServerSnapshot,
  toggleFavorite,
} from "@/lib/favorites";
import { cn } from "@/lib/cn";

export function useFavorites() {
  return useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getFavoritesServerSnapshot,
  );
}

/** Переключатель избранного на карточке товара. */
export function FavoriteButton({
  productId,
  className,
}: {
  productId: number;
  className?: string;
}) {
  const favorites = useFavorites();
  const active = favorites.includes(productId);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Убрать из избранного" : "В избранное"}
      title={active ? "Убрать из избранного" : "В избранное"}
      onClick={(e) => {
        // Кнопка лежит поверх ссылки на товар - гасим переход
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(productId);
      }}
      className={cn(
        "grid size-9 place-items-center rounded-pill border transition-colors",
        active
          ? "border-brand bg-brand text-bone"
          : "border-ink/15 bg-bone/80 text-ink/50 hover:border-brand/50 hover:text-brand",
        className,
      )}
    >
      <Heart className={cn("size-4", active && "fill-current")} />
    </button>
  );
}
