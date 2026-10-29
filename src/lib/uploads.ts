import "server-only";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { extensionOf, isAllowedExtension, MAX_UPLOAD_SIZE } from "@/lib/client-portal";
import { QC_PHOTO_EXTENSIONS, MAX_QC_PHOTO_SIZE } from "@/lib/quality";
import {
  PRODUCT_IMAGE_EXTENSIONS,
  MAX_PRODUCT_IMAGE_SIZE,
} from "@/lib/product-images";

/**
 * Хранение клиентских файлов на диске.
 *
 * Файлы лежат вне public: имена в базе случайные, но выдавать их всем
 * подряд по прямой ссылке нельзя - макет заказа принадлежит одному
 * клиенту. Наружу они отдаются маршрутом, который сперва проверяет, чей
 * это файл.
 */

// Путь берётся из окружения: в контейнере хранилище - примонтированный
// том, а не папка внутри проекта. Сборщику говорим не прослеживать этот
// вызов: иначе он на всякий случай тащит в серверный бандл весь проект
// вместе с public, о чём и предупреждает
const ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.UPLOAD_DIR?.trim() || "./storage/uploads",
);

/**
 * Папки хранилища. Клиентские макеты, фотоотчёты брака и картинки
 * каталога не смешиваем: у каждой папки свои правила и своя выдача.
 *
 * Картинки товаров лежат здесь, а не в public, хотя показываются всем.
 * В public их клали бы до сборки, а образ Docker собирается заново при
 * каждом обновлении - загруженное из админки пропало бы. Хранилище же
 * примонтировано томом и переживает пересборку.
 */
const BUCKETS = {
  clients: path.join(ROOT, "clients"),
  qc: path.join(ROOT, "qc"),
  products: path.join(ROOT, "products"),
} as const;

export type Bucket = keyof typeof BUCKETS;

/** Полный путь к файлу по сохранённому имени, с защитой от выхода вверх. */
export function uploadPath(filename: string, bucket: Bucket = "clients") {
  // basename отсекает любые «../» - имя из базы попадает сюда как есть,
  // и полагаться на то, что оно всегда чистое, не стоит
  const dir = BUCKETS[bucket];
  const safe = path.basename(filename);
  const full = path.join(dir, safe);

  if (!full.startsWith(dir + path.sep)) {
    throw new Error("Недопустимое имя файла");
  }
  return full;
}

export type SavedUpload = {
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
};

/** Ошибка, текст которой можно показать человеку как есть. */
export class UploadError extends Error {}

/**
 * Имя из заголовка запроса в имя для показа: разобранное, без путей. Пустое
 * или нечитаемое - null.
 */
export function cleanOriginalName(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const name = path.basename(decoded.replace(/\\/g, "/")).trim().slice(0, 255);
  return name === "" || name === "." || name === ".." ? null : name;
}

/**
 * Сохраняет макет потоком: тело запроса сразу уходит на диск, в памяти
 * держится один кусок, а не весь файл (раньше File из формы целиком
 * собирался в Buffer - пятьдесят мегабайт на каждую загрузку).
 *
 * Размер считается по фактически пришедшим байтам, а не по заголовку
 * Content-Length: его можно соврать. Как только счётчик перешёл предел,
 * поток обрывается, недописанный файл удаляется. Имя на диске случайное:
 * исходное может содержать что угодно, вплоть до путей, а показывать его
 * достаточно из базы.
 */
export async function saveUploadStream(
  body: ReadableStream<Uint8Array>,
  originalName: string,
  mimeType: string,
  maxBytes: number = MAX_UPLOAD_SIZE,
): Promise<SavedUpload> {
  if (!isAllowedExtension(originalName)) {
    throw new UploadError("Такой формат мы не принимаем");
  }

  await mkdir(BUCKETS.clients, { recursive: true });

  const filename = `${randomBytes(16).toString("hex")}.${extensionOf(originalName)}`;
  const target = uploadPath(filename);

  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      if (size > maxBytes) {
        done(new UploadError("Файл больше 50 МБ - сожмите или пришлите архивом"));
      } else {
        done(null, chunk);
      }
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>),
      counter,
      // wx: имя случайное, но затереть чужой файл не должны ни при каких условиях
      createWriteStream(target, { flags: "wx" }),
    );
  } catch (e) {
    await unlink(target).catch(() => {});
    if (e instanceof UploadError) throw e;
    // Обрыв соединения посреди загрузки - не наша ошибка и не повод для 500
    throw new UploadError("Загрузка прервалась - попробуйте ещё раз");
  }

  if (size === 0) {
    await unlink(target).catch(() => {});
    throw new UploadError("Файл пустой");
  }

  return {
    filename,
    originalName,
    size,
    mimeType: mimeType || "application/octet-stream",
  };
}

/** Удаление с диска. Пропажа файла не должна мешать убрать запись. */
export async function removeUpload(filename: string, bucket: Bucket = "clients") {
  try {
    await unlink(uploadPath(filename, bucket));
  } catch {
    // Файла уже нет - для вызывающего это тот же результат
  }
}

export async function uploadExists(filename: string, bucket: Bucket = "clients") {
  try {
    const s = await stat(uploadPath(filename, bucket));
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Фотоотчёт по дефекту.
 *
 * Отдельно от клиентских макетов: другой список форматов, другой предел
 * размера и другая папка. Снимок с телефона в десять мегабайт - потолок;
 * больше для «покажите, что не так» не нужно.
 */
export async function saveQcPhoto(file: File): Promise<SavedUpload> {
  if (file.size === 0) throw new Error("Файл пустой");
  if (file.size > MAX_QC_PHOTO_SIZE) {
    throw new Error("Снимок больше 8 МБ - сожмите его");
  }

  const originalName = path.basename(file.name);
  const ext = extensionOf(originalName);
  if (!(QC_PHOTO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error("Нужен снимок: JPG, PNG или WebP");
  }

  await mkdir(BUCKETS.qc, { recursive: true });

  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(uploadPath(filename, "qc"), bytes);

  return {
    filename,
    originalName,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

/**
 * Картинка товара - логотип для каталога или фото готовой работы.
 *
 * Отдельно от макетов: тут только растровые форматы и предел меньше.
 * Пережимать не пытаемся - sharp стоит в devDependencies и в рабочий
 * образ не попадает; тяжёлые исходники готовит скрипт
 * `scripts/import-product-images.mjs`.
 */
export async function saveProductImage(file: File): Promise<SavedUpload> {
  if (file.size === 0) throw new Error("Файл пустой");
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
    throw new Error("Картинка больше 8 МБ - сожмите её");
  }

  const originalName = path.basename(file.name);
  const ext = extensionOf(originalName);
  if (!(PRODUCT_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error("Нужна картинка: JPG, PNG или WebP");
  }

  await mkdir(BUCKETS.products, { recursive: true });

  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(uploadPath(filename, "products"), bytes);

  return {
    filename,
    originalName,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}
