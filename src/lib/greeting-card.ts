/**
 * Открытка-поздравление федерации кикбоксинга.
 *
 * Раскладка снята с оригинального макета (assets/images/info.svg старого
 * сайта): размер холста, вырез под фото и три текстовых блока со своими
 * матрицами наклона. Раньше картинку собирал Imagick на сервере - на
 * каждое движение ползунка уходил запрос и новый PNG во временную папку.
 * Здесь всё рисует холст в браузере: предпросмотр живой, а на сервер
 * ничего не уезжает.
 */

export const CARD_WIDTH = 3508;
export const CARD_HEIGHT = 2480;

export const BACKGROUND_SRC = "/editor/background.jpg";

/**
 * Шрифт макета - Bebas Neue Bold с кириллицей, файл предоставил клиент.
 * Именно им набран оригинал; свободные аналоги заметно шире, и надписи
 * при том же кегле не встают на место.
 */
export const CARD_FONT_FAMILY = "BebasNeueCyrillic";
export const CARD_FONT_SOURCES = [
  { url: "/editor/bebas-neue-cyrillic.woff2", format: "woff2" },
  { url: "/editor/bebas-neue-cyrillic.ttf", format: "truetype" },
];

/**
 * Вырез под фотографию - наклонный четырёхугольник из макета.
 * Порядок точек обходит контур, менять его нельзя.
 */
export const PHOTO_SHAPE: [number, number][] = [
  [239.1, 2148.57],
  [1551.98, 1843.03],
  [1551.98, 294.89],
  [239.1, 598.51],
];

/** Матрица из SVG: matrix(a b c d e f). */
export type Matrix = [number, number, number, number, number, number];

export type TextLayer = {
  key: "title" | "name" | "subtitle";
  x: number;
  y: number;
  fontSize: number;
  color: string;
  matrix: Matrix;
  /**
   * Предел ширины строки в собственных координатах слоя.
   *
   * Сетка макета рассчитана на короткие подписи вроде «Имя Отчество»:
   * «Константин Александрович» тем же кеглем уезжает за правый край, и
   * строка ужимается до этой ширины.
   *
   * Значение выведено из геометрии слоя. Начало строки переносится
   * матрицей в точку x' = a·x + c·y + e, а локальный шаг в ширину даёт на
   * холсте a·w. Отсюда предел = (3508 − 40 полей − x') / a.
   */
  maxWidth: number;
};

export const TEXT_LAYERS: TextLayer[] = [
  {
    key: "title",
    x: 81.98,
    y: 1240.2,
    fontSize: 269.87,
    color: "#E31E24",
    matrix: [1.09478, -0.268557, -0.0773969, 1.04857, 1636.34, -263.246],
    maxWidth: 1675, // x' ≈ 1630, a = 1.09478
  },
  {
    key: "name",
    x: 1754,
    y: 1240.2,
    fontSize: 265.98,
    color: "#FEFEFE",
    matrix: [0.991015, -0.237991, -0.0663663, 1.02388, -25.3858, 411.471],
    maxWidth: 1850, // x' ≈ 1631, a = 0.991015
  },
  {
    key: "subtitle",
    x: 1754,
    y: 1240.2,
    fontSize: 99.95,
    color: "#FEFEFE",
    matrix: [1.04747, -0.237991, -0.0776956, 0.971267, -101.443, 614.397],
    maxWidth: 1745, // x' ≈ 1639, a = 1.04747
  },
];

export const DEFAULTS = {
  title: "С днём рождения!",
  name: "Имя Отчество",
  subtitle: "Федерация кикбоксинга Пермского края",
  nameFontSize: 265.98,
};

export type CardText = {
  title: string;
  name: string;
  subtitle: string;
  nameFontSize: number;
};

export type PhotoTransform = {
  /** Масштаб относительно исходного размера фото */
  scale: number;
  /** Поворот в градусах */
  rotation: number;
  /** Сдвиг от центра выреза, в координатах холста */
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_TRANSFORM: PhotoTransform = {
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

/** Центр выреза - вокруг него крутится и от него смещается фотография. */
export function shapeCenter(): [number, number] {
  const cx = PHOTO_SHAPE.reduce((s, p) => s + p[0], 0) / PHOTO_SHAPE.length;
  const cy = PHOTO_SHAPE.reduce((s, p) => s + p[1], 0) / PHOTO_SHAPE.length;
  return [cx, cy];
}

/** Ширина и высота габаритного прямоугольника выреза. */
export function shapeBounds() {
  const xs = PHOTO_SHAPE.map((p) => p[0]);
  const ys = PHOTO_SHAPE.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Масштаб, при котором фотография закрывает вырез целиком.
 * Годится как стартовое значение: пустых углов не остаётся.
 */
export function coverScale(photoWidth: number, photoHeight: number) {
  if (photoWidth <= 0 || photoHeight <= 0) return 1;
  const b = shapeBounds();
  return Math.max(b.width / photoWidth, b.height / photoHeight);
}

export type DrawInput = {
  background: CanvasImageSource;
  photo: CanvasImageSource | null;
  photoWidth: number;
  photoHeight: number;
  transform: PhotoTransform;
  text: CardText;
  fontFamily: string;
};

/**
 * Рисует открытку в холст размером CARD_WIDTH×CARD_HEIGHT.
 *
 * Порядок слоёв тот же, что был на сервере: фон, затем надписи, затем
 * фотография поверх - она перекрывает белый прямоугольник макета, на
 * месте которого и должна оказаться.
 */
export function drawCard(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const { background, photo, photoWidth, photoHeight, transform, text, fontFamily } = input;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(background, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  const values: Record<TextLayer["key"], string> = {
    title: text.title,
    name: text.name,
    subtitle: text.subtitle,
  };

  for (const layer of TEXT_LAYERS) {
    const value = values[layer.key].trim();
    if (value === "") continue;

    // Размер имени задаёт пользователь, остальные строки берут кегль из
    // макета. Дальше любая из них ужимается, если не влезает в свою ширину
    const wanted = layer.key === "name" ? text.nameFontSize : layer.fontSize;

    ctx.setTransform(...layer.matrix);
    ctx.fillStyle = layer.color;
    ctx.textBaseline = "alphabetic";
    ctx.font = `${fitFontSize(ctx, value, wanted, layer.maxWidth, fontFamily)}px ${fontFamily}`;
    ctx.fillText(value, layer.x, layer.y);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (photo && photoWidth > 0 && photoHeight > 0) {
    const [cx, cy] = shapeCenter();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(PHOTO_SHAPE[0][0], PHOTO_SHAPE[0][1]);
    for (const [x, y] of PHOTO_SHAPE.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.clip();

    ctx.translate(cx + transform.offsetX, cy + transform.offsetY);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.scale, transform.scale);
    ctx.drawImage(photo, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight);

    ctx.restore();
  }
}

/**
 * Подбирает кегль, при котором строка укладывается в отведённую ширину.
 *
 * Ширина растёт линейно с кеглем, поэтому хватает одного измерения и
 * пропорции - перебирать размеры по одному незачем. Ниже 40% исходного
 * не опускаемся: совсем мелкая надпись хуже обрезанной, лучше пусть
 * автор сократит текст.
 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
  fontFamily: string,
) {
  ctx.font = `${size}px ${fontFamily}`;
  const width = ctx.measureText(text).width;
  if (width <= maxWidth || width === 0) return size;

  return Math.max(size * 0.4, Math.floor(size * (maxWidth / width)));
}

/** Имя файла для скачивания: по имени именинника и дате. */
export function cardFileName(name: string) {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "otkrytka";

  const today = new Date();
  const stamp = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return `${slug}-${stamp}.png`;
}
