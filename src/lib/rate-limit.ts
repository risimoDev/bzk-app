import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { plural } from "@/lib/num2words";

/**
 * Ограничение частоты попыток.
 *
 * На старом сайте это было (`check_rate_limit` в includes/security.php) и
 * прикрывало регистрацию и вебхук; при переносе потерялось. Таблица
 * rate_limits с нужными индексами уже есть в базе - пишем в неё.
 *
 * Считаем в базе, а не в памяти процесса: счётчик в памяти обнуляется при
 * каждом перезапуске контейнера, то есть снимается ровно тогда, когда
 * подбор идёт полным ходом и приложение перезапускают.
 */

/** Сколько попыток и за какое время. Всё в одном месте, чтобы видеть разом. */
export const LIMITS = {
  /** Вход по конкретной почте - защита одного аккаунта от подбора. */
  login: { max: 5, window: 15 * 60 },
  /** Вход с одного адреса - защита от перебора аккаунтов подряд. */
  loginIp: { max: 20, window: 15 * 60 },
  /** Регистрация: как на старом сайте, три попытки за четверть часа. */
  register: { max: 3, window: 15 * 60 },
  /**
   * Регистрация за сутки с одного адреса. Регистрация сразу входит в
   * аккаунт и честно говорит «адрес занят», а значит, сама служит
   * проверкой «есть ли такой адрес»; суточный потолок делает перебор
   * адресов бессмысленно медленным.
   */
  registerDay: { max: 10, window: 24 * 60 * 60 },
  /** Форма обратной связи. */
  contact: { max: 5, window: 10 * 60 },
  /** Запрос ссылки на смену пароля. */
  passwordReset: { max: 3, window: 15 * 60 },
  /** Привязка телеграма командой /connect - на чат. */
  telegramConnect: { max: 5, window: 5 * 60 },
  /** Выдача кода привязки телеграма - на пользователя. */
  telegramLinkIssue: { max: 5, window: 15 * 60 },
  /**
   * Повторное подтверждение уже вошедшего пользователя (текущий пароль,
   * код второго фактора) - на пользователя. Проверяется ДО bcrypt: иначе
   * лимит срабатывал бы после того, как дорогая проверка уже выполнена.
   */
  reauth: { max: 5, window: 15 * 60 },
  /** Оформление заказа: от случайного двойного нажатия и от шалостей. */
  checkout: { max: 10, window: 10 * 60 },
  /** Проверка промокода: чтобы нельзя было перебором вычислить действующие. */
  promo: { max: 15, window: 10 * 60 },
  /**
   * Загрузка макета клиентом - на пользователя, пятьдесят файлов в сутки.
   * Считается каждая принятая к записи попытка, в том числе потом
   * удалённый файл: иначе «загрузил - удалил» обходило бы потолок.
   */
  upload: { max: 50, window: 24 * 60 * 60 },
  /**
   * Повторы планировщика: сколько раз пробуем доставить одно напоминание
   * или задачу, прежде чем сдаться. Каждый проход - раз в пять минут, так
   * что двенадцать попыток - около часа. Дальше уведомление считается
   * потерянным, а не мучает телеграм (и очередь) трое суток.
   */
  cronRetry: { max: 12, window: 3 * 24 * 60 * 60 },
  /** Новые обращения и ответы в поддержку - на пользователя. */
  ticket: { max: 10, window: 60 * 60 },
  /** Сообщения в обсуждении заказа - на пользователя. */
  orderMessage: { max: 30, window: 60 * 60 },
  /**
   * Уведомление сотрудникам о действиях клиента по одному предмету
   * (тикет, загрузки): не чаще раза в десять минут, иначе поток ответов
   * или файлов засыпал бы всех телеграмами. Ключ - предмет, а не клиент.
   */
  staffNotice: { max: 1, window: 10 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export type RateLimitVerdict = {
  ok: boolean;
  /** Через сколько секунд снова можно - для сообщения пользователю. */
  retryAfter: number;
};

/**
 * Колонка identifier - сто символов. Почта бывает длиннее, а обрезать
 * нельзя: два разных адреса с одинаковым началом делили бы счётчик, и
 * один посетитель запирал бы другого.
 */
function key(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (value.length <= 100) return value;
  return createHash("sha256").update(value).digest("hex").slice(0, 64);
}

/** Сколько попыток уже сделано и когда истечёт самая старая. */
export async function checkRateLimit(
  identifier: string,
  action: LimitName,
): Promise<RateLimitVerdict> {
  const { max, window } = LIMITS[action];
  const since = new Date(Date.now() - window * 1000);

  const rows = await db
    .select({ at: rateLimits.attemptedAt })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.identifier, key(identifier)),
        eq(rateLimits.action, action),
        gte(rateLimits.attemptedAt, since),
      ),
    )
    .orderBy(rateLimits.attemptedAt)
    .limit(max);

  if (rows.length < max) return { ok: true, retryAfter: 0 };

  // Окно скользящее: ждать нужно до того момента, когда самая ранняя
  // из попыток выпадет из него
  const oldest = rows[0].at?.getTime() ?? Date.now();
  const retryAfter = Math.max(1, Math.ceil((oldest + window * 1000 - Date.now()) / 1000));

  return { ok: false, retryAfter };
}

export async function recordAttempt(identifier: string, action: LimitName) {
  await db.insert(rateLimits).values({ identifier: key(identifier), action });

  // Уборка старых записей. Раз в двадцать попыток, а не каждый раз:
  // таблица растёт медленно, а лишний DELETE на каждом входе не нужен
  if (Math.random() < 0.05) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.attemptedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  }
}

/** Успех снимает счётчик: иначе частый вход сам себя запирал бы. */
export async function clearAttempts(identifier: string, action: LimitName) {
  await db
    .delete(rateLimits)
    .where(
      and(eq(rateLimits.identifier, key(identifier)), eq(rateLimits.action, action)),
    );
}

/** «Через 3 минуты» - человеческая форма для сообщения об отказе. */
export function retryAfterText(seconds: number) {
  if (seconds <= 60) return "через минуту";
  const minutes = Math.ceil(seconds / 60);
  return `через ${minutes} ${plural(minutes, ["минуту", "минуты", "минут"])}`;
}

/** Диагностика: сколько записей сейчас лежит по ключу. */
export async function attemptCount(identifier: string, action: LimitName) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(rateLimits)
    .where(
      and(eq(rateLimits.identifier, key(identifier)), eq(rateLimits.action, action)),
    );

  return Number(row?.n ?? 0);
}

/**
 * Можно ли сейчас уведомить сотрудников по этому предмету («ticket:12»,
 * «upload:5»). Первый вызов за окно возвращает true и занимает место,
 * следующие - false: сотрудник увидит всё в самом обращении или карточке.
 */
export async function claimStaffNotice(subject: string): Promise<boolean> {
  const verdict = await checkRateLimit(subject, "staffNotice");
  if (!verdict.ok) return false;
  await recordAttempt(subject, "staffNotice");
  return true;
}
