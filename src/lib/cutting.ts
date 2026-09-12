/**
 * Раскрой материала: сколько изделий помещается на лист.
 *
 * Перенесено из includes/cutting_calculator.php. Алгоритм тот же:
 * прямоугольники укладываются сеткой с проверкой поворота на 90°,
 * круги - сеткой или в шахматном порядке, что плотнее.
 */

export type Shape = "rectangle" | "circle" | "custom";

export type RectangleFit = {
  count: number;
  rows: number;
  cols: number;
  rotated: boolean;
};

/**
 * Прямоугольники на листе.
 *
 * Считаем оба варианта - как есть и повёрнутый на 90° - и берём тот,
 * где помещается больше. Отступ прибавляется к размеру изделия: между
 * соседними изделиями нужен зазор под рез.
 */
export function fitRectangles(
  sheetWidth: number,
  sheetHeight: number,
  itemWidth: number,
  itemHeight: number,
  margin = 2,
): RectangleFit {
  if (itemWidth <= 0 || itemHeight <= 0 || sheetWidth <= 0 || sheetHeight <= 0) {
    return { count: 0, rows: 0, cols: 0, rotated: false };
  }

  const w = itemWidth + margin;
  const h = itemHeight + margin;

  const cols1 = Math.floor(sheetWidth / w);
  const rows1 = Math.floor(sheetHeight / h);
  const count1 = cols1 * rows1;

  const cols2 = Math.floor(sheetWidth / h);
  const rows2 = Math.floor(sheetHeight / w);
  const count2 = cols2 * rows2;

  return count1 >= count2
    ? { count: count1, rows: rows1, cols: cols1, rotated: false }
    : { count: count2, rows: rows2, cols: cols2, rotated: true };
}

export type CircleFit = { count: number; layout: "grid" | "hex" };

/**
 * Круги на листе.
 *
 * Шахматная укладка плотнее сетки: ряды сдвигаются на полдиаметра и
 * садятся в промежутки, поэтому шаг по высоте не d, а d·sin(60°).
 *
 * Здесь исправлена ошибка старого кода: он отдавал большее число рядов
 * сдвинутым (более узким), а не полным. При нечётном числе рядов это
 * занижало вместимость листа на целый ряд - и завышало себестоимость
 * изделия. Правильно: первый ряд полный, значит полных рядов ceil.
 */
export function fitCircles(
  sheetWidth: number,
  sheetHeight: number,
  diameter: number,
  margin = 2,
): CircleFit {
  if (diameter <= 0 || sheetWidth <= 0 || sheetHeight <= 0) {
    return { count: 0, layout: "grid" };
  }

  const d = diameter + margin;

  const gridCols = Math.floor(sheetWidth / d);
  const gridRows = Math.floor(sheetHeight / d);
  const gridCount = gridCols * gridRows;

  const hexRowHeight = d * Math.sin(Math.PI / 3);
  const hexRows = Math.floor(sheetHeight / hexRowHeight);
  const shiftedCols = Math.max(0, Math.floor((sheetWidth - d / 2) / d));

  const fullRows = Math.ceil(hexRows / 2);
  const shiftedRows = Math.floor(hexRows / 2);
  const hexCount = fullRows * gridCols + shiftedRows * shiftedCols;

  return gridCount >= hexCount
    ? { count: gridCount, layout: "grid" }
    : { count: hexCount, layout: "hex" };
}

export type CuttingResult = {
  count: number;
  materialSize: string;
  itemSize: string | null;
  margin: number;
  rows?: number;
  cols?: number;
  rotated?: boolean;
  layout?: "grid" | "hex";
  /** Доля площади листа, занятая изделиями, в процентах */
  efficiency: number;
  waste: number;
  error?: string;
};

export function calculateCutting(
  material: { widthMm: number; heightMm: number },
  item: {
    shape: Shape;
    widthMm?: number;
    heightMm?: number;
    diameterMm?: number;
    marginMm?: number;
  },
): CuttingResult {
  const sheetW = material.widthMm;
  const sheetH = material.heightMm;
  const margin = item.marginMm ?? 2;

  const base = {
    count: 0,
    materialSize: `${sheetW}×${sheetH} мм`,
    itemSize: null,
    margin,
    efficiency: 0,
    waste: 0,
  } satisfies CuttingResult;

  if (sheetW <= 0 || sheetH <= 0) {
    return { ...base, error: "Не указаны размеры материала" };
  }

  const sheetArea = sheetW * sheetH;

  if (item.shape === "circle") {
    const d = item.diameterMm ?? 0;
    if (d <= 0) return { ...base, error: "Не указан диаметр изделия" };

    const fit = fitCircles(sheetW, sheetH, d, margin);
    const itemArea = Math.PI * (d / 2) ** 2 * fit.count;
    const efficiency = fit.count > 0 ? +((itemArea / sheetArea) * 100).toFixed(1) : 0;

    return {
      ...base,
      count: fit.count,
      itemSize: `⌀${d} мм`,
      layout: fit.layout,
      efficiency,
      waste: fit.count > 0 ? +(100 - efficiency).toFixed(1) : 0,
    };
  }

  const w = item.widthMm ?? 0;
  const h = item.heightMm ?? 0;
  if (w <= 0 || h <= 0) return { ...base, error: "Не указаны размеры изделия" };

  const fit = fitRectangles(sheetW, sheetH, w, h, margin);
  const itemArea = w * h * fit.count;
  const efficiency = fit.count > 0 ? +((itemArea / sheetArea) * 100).toFixed(1) : 0;

  return {
    ...base,
    count: fit.count,
    itemSize: `${w}×${h} мм`,
    rows: fit.rows,
    cols: fit.cols,
    rotated: fit.rotated,
    efficiency,
    waste: fit.count > 0 ? +(100 - efficiency).toFixed(1) : 0,
  };
}

/** Себестоимость материала на одно изделие. */
export function materialCostPerItem(
  material: { widthMm: number; heightMm: number; costPerUnit: number },
  item: Parameters<typeof calculateCutting>[1],
) {
  const cutting = calculateCutting(material, item);

  if (cutting.count <= 0) {
    return {
      costPerItem: 0,
      itemsPerSheet: 0,
      cutting,
      error: cutting.error ?? "Изделие не помещается на лист",
    };
  }

  return {
    costPerItem: +(material.costPerUnit / cutting.count).toFixed(2),
    itemsPerSheet: cutting.count,
    cutting,
  };
}
