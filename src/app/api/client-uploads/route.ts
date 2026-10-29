import { revalidatePath } from "next/cache";
import { currentUser } from "@/auth";
import {
  CLIENT_UPLOAD_QUOTA,
  MAX_UPLOAD_SIZE,
  isAllowedExtension,
} from "@/lib/client-portal";
import {
  clientUsedBytes,
  insertUploadWithinQuota,
  ownsOrder,
} from "@/lib/client-uploads-db";
import { parseId } from "@/lib/ids";
import { notifyClientUpload } from "@/lib/notify";
import {
  checkRateLimit,
  claimStaffNotice,
  recordAttempt,
  retryAfterText,
} from "@/lib/rate-limit";
import { cleanOriginalName, removeUpload, saveUploadStream, UploadError } from "@/lib/uploads";

/**
 * Загрузка макета клиентом.
 *
 * Файл идёт сюда, а не в серверное действие, по трём причинам. Во-первых,
 * действие принимает тело целиком и держит его в памяти, а лимит тела
 * действий общий на весь сайт - ради пятидесяти мегабайт его пришлось бы
 * поднимать для каждой формы. Во-вторых, здесь тело читается потоком и
 * сразу пишется на диск. В-третьих, тут же квота клиента и суточный
 * потолок числа файлов.
 *
 * Формат запроса: тело - сами байты файла (не multipart, разбирать его
 * потоком нечем), метаданные в заголовках: X-File-Name и X-Description
 * закодированы encodeURIComponent, X-Order-Id - число или пусто. Маршрут
 * исключён из src/proxy.ts: тот буферизует тело запроса в памяти.
 */
export const dynamic = "force-dynamic";

function fail(status: number, message: string, headers?: Record<string, string>) {
  return Response.json({ ok: false, message }, { status, headers });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail(401, "Требуется вход");

  const userId = Number(user.id);

  // Размер из заголовка - для раннего отказа; настоящий предел держит
  // счётчик при записи
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) {
    return fail(411, "Не удалось определить размер файла");
  }
  if (declared > MAX_UPLOAD_SIZE) {
    return fail(413, "Файл больше 50 МБ - сожмите или пришлите архивом");
  }

  const originalName = cleanOriginalName(req.headers.get("x-file-name") ?? "");
  if (!originalName) return fail(400, "Файл не выбран");
  if (!isAllowedExtension(originalName)) return fail(415, "Такой формат мы не принимаем");

  let description = "";
  try {
    description = decodeURIComponent(req.headers.get("x-description") ?? "").trim();
  } catch {
    return fail(400, "Не удалось прочитать описание");
  }
  if (description.length > 500) {
    return fail(400, `«Описание»: не длиннее 500 знаков, сейчас ${description.length}`);
  }

  const rawOrder = (req.headers.get("x-order-id") ?? "").trim();
  const orderId = rawOrder === "" ? null : parseId(rawOrder);
  if (rawOrder !== "" && orderId === null) return fail(400, "Заказ не найден");
  if (orderId !== null && !(await ownsOrder(userId, orderId))) {
    return fail(404, "Заказ не найден");
  }

  if (!req.body) return fail(400, "Файл не выбран");

  const verdict = await checkRateLimit(String(userId), "upload");
  if (!verdict.ok) {
    return fail(
      429,
      `Сегодня загружено слишком много файлов - попробуйте ${retryAfterText(verdict.retryAfter)}`,
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  if ((await clientUsedBytes(userId)) + declared > CLIENT_UPLOAD_QUOTA) {
    return fail(413, "Место для ваших файлов закончилось (1 ГБ) - удалите ненужные файлы");
  }

  // Считаем попытку до записи: оборванные и отклонённые на диске загрузки
  // тоже расходуют полосу, и пересылать их бесконечно нельзя
  await recordAttempt(String(userId), "upload");

  let saved;
  try {
    saved = await saveUploadStream(req.body, originalName, req.headers.get("content-type") ?? "");
  } catch (e) {
    if (e instanceof UploadError) return fail(400, e.message);
    throw e;
  }

  const stored = await insertUploadWithinQuota({
    userId,
    orderId,
    filename: saved.filename,
    originalName: saved.originalName,
    fileSize: saved.size,
    mimeType: saved.mimeType,
    description: description || null,
  }).catch(async (e) => {
    await removeUpload(saved.filename);
    throw e;
  });

  if (!stored.ok) {
    await removeUpload(saved.filename);
    return fail(413, "Место для ваших файлов закончилось (1 ГБ) - удалите ненужные файлы");
  }

  // Серия файлов подряд - одно уведомление, а не по телеграму на каждый
  if (await claimStaffNotice(`upload:${userId}`)) {
    await notifyClientUpload({
      userId,
      clientName: user.name ?? "Клиент",
      fileName: saved.originalName,
      orderId,
    });
  }

  revalidatePath("/client/uploads");
  if (orderId) revalidatePath(`/client/orders/${orderId}`);
  return Response.json({ ok: true, message: `Файл «${saved.originalName}» загружен` });
}
