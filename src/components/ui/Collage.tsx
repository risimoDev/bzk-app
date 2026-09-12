import Image from "next/image";
import { cn } from "@/lib/cn";
import { collage, type Asset } from "@/lib/assets";

/**
 * Коллажные детали брендбука - скрепки, обрывки бумаги, росчерки.
 *
 * Все они декоративные: пустой alt убирает их из озвучки экранных
 * читалок, иначе слепой пользователь услышит «скрепка, скрепка, звезда»
 * посреди заголовка.
 */
export function Decor({
  asset,
  className,
  priority = false,
}: {
  asset: Asset;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt=""
      aria-hidden
      priority={priority}
      className={cn("pointer-events-none select-none", className)}
    />
  );
}

/** Готовые наборы, чтобы не таскать ключи по страницам. */
export const clip = {
  mint: collage["clip-mint"],
  steel: collage["clip-steel"],
  binder: collage["clip-binder"],
};

/**
 * Росчерки названы по цвету чернил, а не по форме, потому что выбирать
 * их приходится по фону: белые ложатся на тёмное, чёрные - на светлое.
 * Имя вроде «scribble-circle» этого не сообщает, и деталь молча пропадает.
 */
export const scribble = {
  /** На тёмный фон */
  starWhite: collage["scribble-star-white"],
  zigzagWhite: collage["scribble-zigzag-white"],
  /** На светлый фон */
  circleBlack: collage["scribble-circle-black"],
  tangleBlack: collage["scribble-tangle-black"],
  loopsBlack: collage["scribble-loops-black"],
};

export const scrap = {
  paperStrip: collage["scrap-paper-strip"],
  graphStrip: collage["scrap-graph-strip"],
  graphCrumpled: collage["scrap-graph-crumpled"],
  edgeThin: collage["scrap-edge-thin"],
  edgeDiagonal: collage["scrap-edge-diagonal"],
  moneyStrip: collage["scrap-money-strip"],
  moneyLarge: collage["scrap-money-large"],
  cornerMoney: collage["scrap-corner-money"],
  sheetBone: collage["torn-sheet-bone"],
};

export const merch = {
  mug: collage["merch-mug"],
  patch: collage["patch-bzk"],
  usb: collage["merch-usb"],
  keychain: collage["merch-keychain"],
  boxes: collage["merch-boxes"],
};

