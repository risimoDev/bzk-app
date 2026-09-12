"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, RotateCcw, TriangleAlert } from "lucide-react";
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  BACKGROUND_SRC,
  DEFAULTS,
  DEFAULT_TRANSFORM,
  coverScale,
  drawCard,
  CARD_FONT_FAMILY,
  CARD_FONT_SOURCES,
  PHOTO_SHAPE,
  shapeCenter,
  cardFileName,
  type CardText,
  type PhotoTransform,
} from "@/lib/greeting-card";
import { cn } from "@/lib/cn";

/** Загрузка картинки с ожиданием декодирования - иначе на холст попадёт пустое. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    img.src = src;
  });
}

/** Запасное семейство, если шрифт макета почему-то не загрузился. */
function fallbackFontFamily() {
  if (typeof window === "undefined") return "sans-serif";
  // next/font подставляет сгенерированное имя в переменную; холсту нужно
  // именно оно - «var(...)» в ctx.font не работает
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-oswald")
    .trim();
  return value || "Impact, sans-serif";
}

/**
 * Подключает шрифт макета.
 *
 * Через FontFace, а не через @font-face в стилях: файл нужен одной этой
 * странице, и незачем тянуть его на весь сайт. Формат woff2 идёт первым,
 * ttf остаётся для браузеров, которые его не понимают.
 */
let cardFontPromise: Promise<void> | null = null;

function loadCardFont() {
  // Один раз на вкладку: в режиме разработки эффект вызывается дважды, и
  // без этого шрифт попадал бы в document.fonts двумя одинаковыми копиями
  cardFontPromise ??= (async () => {
    const src = CARD_FONT_SOURCES.map((s) => `url(${s.url}) format("${s.format}")`).join(", ");
    const face = new FontFace(CARD_FONT_FAMILY, src);
    await face.load();
    document.fonts.add(face);
  })();

  return cardFontPromise;
}

const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export function CardEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const fontRef = useRef<string>(CARD_FONT_FAMILY);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [text, setText] = useState<CardText>({
    title: DEFAULTS.title,
    name: DEFAULTS.name,
    subtitle: DEFAULTS.subtitle,
    nameFontSize: DEFAULTS.nameFontSize,
  });
  const [transform, setTransform] = useState<PhotoTransform>(DEFAULT_TRANSFORM);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const background = backgroundRef.current;
    if (!canvas || !background) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photo = photoRef.current;
    drawCard(ctx, {
      background,
      photo,
      photoWidth: photo?.naturalWidth ?? 0,
      photoHeight: photo?.naturalHeight ?? 0,
      transform,
      text,
      fontFamily: fontRef.current,
    });
  }, [text, transform]);

  // Фон и шрифт грузятся один раз, и оба до первой отрисовки: холст
  // рисует тем, что готово на момент вызова, - не дождавшись шрифта,
  // первый кадр вышел бы системным
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [background] = await Promise.all([
          loadImage(BACKGROUND_SRC),
          loadCardFont().catch(() => {
            // Без шрифта макета открытку всё равно можно собрать -
            // просто буквы будут другими, и об этом надо сказать
            fontRef.current = fallbackFontFamily();
            setError(
              "Шрифт макета не загрузился - надписи набраны запасным. Обновите страницу.",
            );
          }),
        ]);

        if (cancelled) return;
        backgroundRef.current = background;
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось подготовить редактор");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  // Объектный адрес фотографии живёт до замены или ухода со страницы
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Нужна картинка: JPG, PNG или WebP");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Фотография больше 25 МБ - уменьшите её");
      return;
    }

    setError(null);

    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;

    try {
      const img = await loadImage(url);
      photoRef.current = img;
      setHasPhoto(true);
      // Стартовый масштаб подбираем так, чтобы фото закрыло вырез целиком
      setTransform({
        ...DEFAULT_TRANSFORM,
        scale: coverScale(img.naturalWidth, img.naturalHeight),
      });
    } catch {
      setError("Не удалось прочитать файл - попробуйте другой");
    }
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Не удалось собрать картинку");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cardFileName(text.name);
      a.click();
      // Освобождаем сразу: ссылка уже сработала, файл ушёл в загрузки
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function reset() {
    setText({
      title: DEFAULTS.title,
      name: DEFAULTS.name,
      subtitle: DEFAULTS.subtitle,
      nameFontSize: DEFAULTS.nameFontSize,
    });
    setTransform(
      photoRef.current
        ? {
            ...DEFAULT_TRANSFORM,
            scale: coverScale(
              photoRef.current.naturalWidth,
              photoRef.current.naturalHeight,
            ),
          }
        : DEFAULT_TRANSFORM,
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* ---------- Предпросмотр ---------- */}
      <div className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-card border border-ink/10 bg-ink/5">
          <canvas
            ref={canvasRef}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            aria-label="Предпросмотр открытки"
            className="block h-auto w-full"
          />

          {/* Подсказка, куда встанет фотография. Рисуется поверх холста
              отдельным слоем, а не в него: на скачанной картинке рамке
              не место */}
          {!hasPhoto && (
            <svg
              viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden
            >
              <polygon
                points={PHOTO_SHAPE.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="rgb(255 255 255 / 0.12)"
                stroke="rgb(255 255 255 / 0.7)"
                strokeWidth={10}
                strokeDasharray="40 30"
              />
              <text
                x={shapeCenter()[0]}
                y={shapeCenter()[1]}
                textAnchor="middle"
                fill="rgb(255 255 255 / 0.85)"
                fontSize={110}
                fontFamily="system-ui, sans-serif"
              >
                сюда встанет фотография
              </text>
            </svg>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={download}
            disabled={!ready}
            className="flex items-center gap-2 rounded-pill bg-brand px-6 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden />
            СКАЧАТЬ PNG
          </button>

          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-pill border border-ink/15 px-5 py-2.5 font-display text-xs tracking-wider text-ink/70 transition-colors hover:border-ink/30 hover:text-ink"
          >
            <RotateCcw className="size-4" aria-hidden />
            СБРОСИТЬ
          </button>

          <span className="text-sm text-ink/45">
            {CARD_WIDTH} × {CARD_HEIGHT} - годится и для печати, и для поста
          </span>
        </div>

        {error && (
          <p className="flex items-start gap-2.5 rounded-card bg-danger/10 px-4 py-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>

      {/* ---------- Управление ---------- */}
      <div className="flex flex-col gap-5">
        <section className="rounded-card border border-ink/10 bg-bone/85 p-5">
          <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/45">
            ФОТОГРАФИЯ
          </h2>

          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-ink/25 px-4 py-6 text-sm text-ink/60 transition-colors hover:border-brand/50 hover:text-brand">
            <ImagePlus className="size-5" aria-hidden />
            {hasPhoto ? "Заменить фотографию" : "Выбрать фотографию"}
            <input
              type="file"
              accept="image/*"
              onChange={onPhotoChange}
              className="sr-only"
            />
          </label>

          {hasPhoto && (
            <div className="mt-4 flex flex-col gap-4">
              <Slider
                label="Размер"
                value={transform.scale}
                min={0.05}
                max={4}
                step={0.01}
                display={`${Math.round(transform.scale * 100)}%`}
                onChange={(scale) => setTransform((t) => ({ ...t, scale }))}
              />
              <Slider
                label="Поворот"
                value={transform.rotation}
                min={-45}
                max={45}
                step={0.5}
                display={`${transform.rotation}°`}
                onChange={(rotation) => setTransform((t) => ({ ...t, rotation }))}
              />
              <Slider
                label="Сдвиг влево-вправо"
                value={transform.offsetX}
                min={-900}
                max={900}
                step={5}
                display={String(transform.offsetX)}
                onChange={(offsetX) => setTransform((t) => ({ ...t, offsetX }))}
              />
              <Slider
                label="Сдвиг вверх-вниз"
                value={transform.offsetY}
                min={-900}
                max={900}
                step={5}
                display={String(transform.offsetY)}
                onChange={(offsetY) => setTransform((t) => ({ ...t, offsetY }))}
              />
            </div>
          )}
        </section>

        <section className="rounded-card border border-ink/10 bg-bone/85 p-5">
          <h2 className="font-display text-[0.68rem] tracking-[0.18em] text-ink/45">
            НАДПИСИ
          </h2>

          <div className="mt-3 flex flex-col gap-4">
            <Field label="Заголовок" htmlFor="card-title">
              <input
                id="card-title"
                value={text.title}
                maxLength={60}
                onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Имя и отчество" htmlFor="card-name">
              <input
                id="card-name"
                value={text.name}
                maxLength={60}
                onChange={(e) => setText((t) => ({ ...t, name: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Slider
              label="Размер имени"
              value={text.nameFontSize}
              min={120}
              max={340}
              step={1}
              display={`${Math.round(text.nameFontSize)}`}
              onChange={(nameFontSize) => setText((t) => ({ ...t, nameFontSize }))}
            />

            <Field label="Подпись снизу" htmlFor="card-subtitle">
              <input
                id="card-subtitle"
                value={text.subtitle}
                maxLength={120}
                onChange={(e) => setText((t) => ({ ...t, subtitle: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45"
      >
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = `slider-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="font-display text-[0.68rem] tracking-[0.16em] text-ink/45"
        >
          {label.toUpperCase()}
        </label>
        <span className="font-mono text-xs tabular-nums text-ink/55">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </div>
  );
}

const inputClass = cn(
  "w-full rounded-card border border-ink/15 bg-bone px-4 py-2.5 text-sm text-ink",
  "placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright",
);
