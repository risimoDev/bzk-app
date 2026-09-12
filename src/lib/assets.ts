/**
 * Размеры оптимизированных картинок.
 *
 * Сгенерировано: scripts/optimize-assets.mjs - руками не править.
 */

export type Asset = { src: string; width: number; height: number };

export const bg = {
  "mint-gradient": { src: "/bg/mint-gradient.webp", width: 2000, height: 1091 },
  "paper-dark-kraft": { src: "/bg/paper-dark-kraft.webp", width: 1376, height: 768 },
  "paper-dark": { src: "/bg/paper-dark.webp", width: 2000, height: 1091 },
  "paper-light": { src: "/bg/paper-light.webp", width: 2000, height: 1091 },
} as const satisfies Record<string, Asset>;

export const collage = {
  "clip-binder": { src: "/collage/clip-binder.webp", width: 1400, height: 1165 },
  "clip-mint": { src: "/collage/clip-mint.webp", width: 269, height: 918 },
  "clip-steel": { src: "/collage/clip-steel.webp", width: 213, height: 500 },
  "merch-boxes": { src: "/collage/merch-boxes.webp", width: 1024, height: 1024 },
  "merch-keychain": { src: "/collage/merch-keychain.webp", width: 1024, height: 865 },
  "merch-mug": { src: "/collage/merch-mug.webp", width: 1024, height: 816 },
  "merch-usb": { src: "/collage/merch-usb.webp", width: 1024, height: 1024 },
  "patch-bzk": { src: "/collage/patch-bzk.webp", width: 1024, height: 971 },
  "scrap-corner-money": { src: "/collage/scrap-corner-money.webp", width: 1024, height: 1024 },
  "scrap-edge-diagonal": { src: "/collage/scrap-edge-diagonal.webp", width: 1400, height: 1041 },
  "scrap-edge-thin": { src: "/collage/scrap-edge-thin.webp", width: 1138, height: 3230 },
  "scrap-graph-crumpled": { src: "/collage/scrap-graph-crumpled.webp", width: 1400, height: 1062 },
  "scrap-graph-strip": { src: "/collage/scrap-graph-strip.webp", width: 1100, height: 334 },
  "scrap-money-large": { src: "/collage/scrap-money-large.webp", width: 1400, height: 1557 },
  "scrap-money-strip": { src: "/collage/scrap-money-strip.webp", width: 1146, height: 411 },
  "scrap-paper-strip": { src: "/collage/scrap-paper-strip.webp", width: 1064, height: 324 },
  "scribble-circle-black": { src: "/collage/scribble-circle-black.webp", width: 891, height: 453 },
  "scribble-loops-black": { src: "/collage/scribble-loops-black.webp", width: 1400, height: 1213 },
  "scribble-star-white": { src: "/collage/scribble-star-white.webp", width: 658, height: 507 },
  "scribble-tangle-black": { src: "/collage/scribble-tangle-black.webp", width: 1400, height: 1261 },
  "scribble-zigzag-white": { src: "/collage/scribble-zigzag-white.webp", width: 1400, height: 1473 },
  "torn-sheet-bone": { src: "/collage/torn-sheet-bone.webp", width: 794, height: 1078 },
} as const satisfies Record<string, Asset>;

export const production = {
  "press-01": { src: "/production/press-01.webp", width: 1600, height: 873 },
  "press-02": { src: "/production/press-02.webp", width: 1600, height: 873 },
  "press-03": { src: "/production/press-03.webp", width: 1600, height: 873 },
  "press-04": { src: "/production/press-04.webp", width: 1600, height: 873 },
  "press-05": { src: "/production/press-05.webp", width: 1600, height: 873 },
  "press-06": { src: "/production/press-06.webp", width: 1600, height: 873 },
  "press-07": { src: "/production/press-07.webp", width: 1600, height: 873 },
} as const satisfies Record<string, Asset>;
