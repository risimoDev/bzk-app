import { eq, and, desc, or } from "drizzle-orm";
import { db } from "@/db";
import { users, orders, externalOrders, tasks } from "@/db/schema";
import {
  checkWebhookSecret,
  hasWebhookSecret,
  sendMessage,
  esc,
  isTelegramConfigured,
} from "@/lib/telegram";
import { LINK_CODE_TTL_MINUTES } from "@/lib/telegram-link";
import {
  consumeLinkCode,
  linkChatToUser,
  sendTelegramLinkedNotice,
} from "@/lib/telegram-link-db";
import { statusOf } from "@/lib/order-status";
import { externalProductionStatus } from "@/lib/external-orders";
import { taskStatus } from "@/lib/tasks";
import { absoluteUrl } from "@/lib/site";
import { checkRateLimit, recordAttempt, retryAfterText } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/notify-after";

/**
 * Приём обновлений от телеграма.
 *
 * Отвечаем 200 почти всегда: на любой другой код телеграм повторяет
 * доставку, и одна кривая команда начинает долбиться раз в секунду.
 * Ошибку показываем пользователю сообщением, а не кодом ответа.
 */

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

type Update = {
  message?: {
    chat?: { id?: number };
    from?: { id?: number; first_name?: string };
    text?: string;
  };
};

const OK = () => new Response("OK");

export async function POST(req: Request) {
  if (!isTelegramConfigured()) return OK();

  // В бою вебхук без секрета - открытая дверь: кто угодно шлёт боту
  // команды от чужого имени. Токен есть, а секрета нет - значит настройку
  // не довели до конца, и принимать такие запросы нельзя
  if (process.env.NODE_ENV === "production" && !hasWebhookSecret()) {
    return new Response("Webhook secret not configured", { status: 503 });
  }

  if (!checkWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    // Чужой запрос: отвечаем 401 - телеграм сюда и не придёт, а вот
    // случайный сканер пусть получит отказ
    return new Response("Forbidden", { status: 401 });
  }

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return OK();
  }

  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  const firstName = update.message?.from?.first_name ?? "";

  if (!chatId || text === "") return OK();

  try {
    await handleCommand(chatId, text, firstName);
  } catch {
    await sendMessage(chatId, "Что-то пошло не так. Попробуйте позже.");
  }

  return OK();
}

/** Пользователь, привязанный к этому чату. */
async function findByChat(chatId: number) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.telegramChatId, String(chatId)))
    .limit(1);

  return user && !user.isBlocked ? user : null;
}

function isStaff(role: string | null) {
  return role === "admin" || role === "manager";
}

async function handleCommand(chatId: number, text: string, firstName: string) {
  const command = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
  const rest = text.slice(command.length).trim();

  switch (command) {
    case "/start":
      return start(chatId, firstName);
    case "/connect":
      return connect(chatId, rest);
    case "/disconnect":
      return disconnect(chatId);
    case "/help":
      return help(chatId);
    case "/myorders":
      return myOrders(chatId);
    case "/track":
      return track(chatId, rest);
    case "/tasks":
      return staffTasks(chatId);
    default:
      return help(chatId);
  }
}

async function start(chatId: number, firstName: string) {
  const user = await findByChat(chatId);

  if (user) {
    return sendMessage(
      chatId,
      `С возвращением, ${esc(user.name)}.\n\n` +
        `Аккаунт уже связан с этим чатом - сюда приходят уведомления о заказах.\n\n` +
        `/myorders - мои заказы\n/track номер - стадия заказа\n/help - что ещё умею`,
    );
  }

  return sendMessage(
    chatId,
    `Здравствуйте${firstName ? `, ${esc(firstName)}` : ""}.\n\n` +
      `Это бот БЗК Принт. Он присылает уведомления о ваших заказах.\n\n` +
      `<b>Чтобы связать аккаунт:</b>\n` +
      `1. Войдите в кабинет на сайте\n` +
      `2. Откройте «Профиль» и нажмите «Получить код»\n` +
      `3. Пришлите сюда: <code>/connect КОД</code>\n\n` +
      `Код живёт ${LINK_CODE_TTL_MINUTES} минут.`,
    [[{ text: "Открыть профиль", url: absoluteUrl("/client/settings") }]],
  );
}

/**
 * Привязка по разовому коду.
 *
 * Старый бот связывал аккаунт по одной лишь почте, и любой, кто её знал,
 * получал чужие уведомления. Код выдаётся в кабинете по кнопке, значит
 * человек уже вошёл в аккаунт; после привязки владельцу уходит письмо.
 */
async function connect(chatId: number, arg: string) {
  if (arg === "") {
    return sendMessage(
      chatId,
      "Пришлите код из кабинета: <code>/connect КОД</code>\n\n" +
        "Код выдаётся в «Профиле» на сайте по кнопке «Получить код».",
    );
  }

  /**
   * Пять неверных попыток на чат за пять минут. Код случайный и длинный,
   * так что подобрать его нельзя и без лимита, но без ограничения бот
   * отвечал бы на каждую попытку - и работал бы усилителем нагрузки на
   * себя же. Считаем по чату, а не по пользователю: на неверном коде
   * неизвестно, чей аккаунт пытались угадать.
   */
  const limit = await checkRateLimit(`tg:${chatId}`, "telegramConnect");
  if (!limit.ok) {
    return sendMessage(
      chatId,
      `Слишком много попыток. Попробуйте ${retryAfterText(limit.retryAfter)}.`,
    );
  }

  // Код одноразовый: погашается этим же запросом, повторить его нельзя
  const userId = await consumeLinkCode(arg);
  if (!userId) {
    await recordAttempt(`tg:${chatId}`, "telegramConnect");
    return sendMessage(
      chatId,
      `Код не подошёл. Он живёт ${LINK_CODE_TTL_MINUTES} минут и работает один раз - возьмите свежий в «Профиле» на сайте.`,
    );
  }

  const user = await linkChatToUser(userId, chatId);
  if (!user) {
    return sendMessage(chatId, "Аккаунт не найден или заблокирован.");
  }

  // Письмо не задерживает ответ в чате и не роняет привязку, если почта
  // не отвечает. after() держит процесс живым, пока письмо не уйдёт, а
  // неудача попадает в лог: хозяин аккаунта не узнал о чужой привязке
  afterResponse("telegram-linked-notice", async () => {
    const r = await sendTelegramLinkedNotice(user);
    if (r && !r.ok) console.error("[telegram-linked-notice] письмо не ушло:", r.error);
  });

  return sendMessage(
    chatId,
    `Готово, ${esc(user.name)}. Аккаунт связан с этим чатом.\n\n` +
      `Уведомления о заказах будут приходить сюда. Отключить - командой /disconnect ` +
      `или галочкой в профиле.`,
  );
}

async function disconnect(chatId: number) {
  const user = await findByChat(chatId);
  if (!user) return sendMessage(chatId, "Этот чат ни к какому аккаунту не привязан.");

  await db
    .update(users)
    .set({ telegramChatId: null, telegramNotifications: false })
    .where(eq(users.id, user.id));

  return sendMessage(
    chatId,
    "Связь с аккаунтом убрана, уведомления сюда больше не придут.\n\n" +
      "Вернуть - снова /connect с кодом из кабинета.",
  );
}

async function help(chatId: number) {
  const user = await findByChat(chatId);

  const common =
    `<b>Команды</b>\n` +
    `/myorders - мои заказы\n` +
    `/track номер - стадия конкретного заказа\n` +
    `/disconnect - отвязать аккаунт\n` +
    `/help - эта справка`;

  const staff = `\n\n<b>Для сотрудников</b>\n/tasks - незакрытые задачи`;

  if (!user) {
    return sendMessage(
      chatId,
      `Сначала свяжите аккаунт: возьмите код в «Профиле» на сайте и пришлите ` +
        `<code>/connect КОД</code>.\n\n${common}`,
    );
  }

  return sendMessage(chatId, common + (isStaff(user.role) ? staff : ""));
}

async function myOrders(chatId: number) {
  const user = await findByChat(chatId);
  if (!user) return sendMessage(chatId, "Сначала свяжите аккаунт: /connect КОД");

  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalPrice: orders.totalPrice,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  if (rows.length === 0) {
    return sendMessage(chatId, "Заказов пока нет.", [
      [{ text: "Каталог", url: absoluteUrl("/catalog") }],
    ]);
  }

  const lines = rows.map(
    (o) =>
      `№ ${o.id} - ${esc(statusOf(o.status).label)}, ${esc(money.format(Number(o.totalPrice)))}` +
      (o.createdAt ? ` от ${dt.format(o.createdAt)}` : ""),
  );

  return sendMessage(chatId, `<b>Ваши заказы</b>\n\n${lines.join("\n")}`, [
    [{ text: "Открыть кабинет", url: absoluteUrl("/client/orders") }],
  ]);
}

/**
 * Стадия заказа по номеру.
 *
 * Сайтовый заказ показываем только его владельцу. Заказ, оформленный
 * менеджером, привязки к аккаунту не имеет, поэтому его стадию видят
 * только сотрудники - иначе по перебору номеров вытягивалась бы вся
 * клиентская база.
 */
async function track(chatId: number, arg: string) {
  const user = await findByChat(chatId);
  if (!user) return sendMessage(chatId, "Сначала свяжите аккаунт: /connect КОД");

  const orderId = Number(arg.replace(/\D/g, ""));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return sendMessage(chatId, "Укажите номер: <code>/track 17</code>");
  }

  const [own] = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalPrice: orders.totalPrice,
      readyDate: orders.readyDate,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
    .limit(1);

  if (own) {
    return sendMessage(
      chatId,
      `<b>Заказ № ${own.id}</b>\n` +
        `Стадия: ${esc(statusOf(own.status).label)}\n` +
        `Сумма: ${esc(money.format(Number(own.totalPrice)))}` +
        (own.readyDate ? `\nГотовность: ${dt.format(own.readyDate)}` : ""),
      [[{ text: "Открыть заказ", url: absoluteUrl(`/client/orders/${own.id}`) }]],
    );
  }

  if (isStaff(user.role)) {
    const [ext] = await db
      .select({
        id: externalOrders.id,
        clientName: externalOrders.clientName,
        status: externalOrders.status,
        productionStatus: externalOrders.productionStatus,
        totalPrice: externalOrders.totalPrice,
        readyDate: externalOrders.estimatedReadyDate,
      })
      .from(externalOrders)
      .where(eq(externalOrders.id, orderId))
      .limit(1);

    if (ext) {
      return sendMessage(
        chatId,
        `<b>Заказ менеджера № ${ext.id}</b>\n` +
          `Клиент: ${esc(ext.clientName)}\n` +
          `Производство: ${esc(externalProductionStatus(ext.productionStatus).label)}\n` +
          `Оплата: ${ext.status === "paid" ? "оплачен" : ext.status === "partial" ? "частично" : "не оплачен"}\n` +
          `Сумма: ${esc(money.format(Number(ext.totalPrice)))}` +
          (ext.readyDate ? `\nГотовность: ${dt.format(ext.readyDate)}` : ""),
        [[{ text: "Открыть в админке", url: absoluteUrl(`/admin/external-orders/${ext.id}`) }]],
      );
    }
  }

  return sendMessage(chatId, `Заказ № ${orderId} не найден среди ваших.`);
}

async function staffTasks(chatId: number) {
  const user = await findByChat(chatId);
  if (!user) return sendMessage(chatId, "Сначала свяжите аккаунт: /connect КОД");
  if (!isStaff(user.role)) {
    return sendMessage(chatId, "Задачи доступны сотрудникам.");
  }

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
    })
    .from(tasks)
    .where(or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")))
    .orderBy(desc(tasks.updatedAt))
    .limit(15);

  if (rows.length === 0) {
    return sendMessage(chatId, "Незакрытых задач нет.");
  }

  const lines = rows.map((t) => {
    const mine = t.assignedTo === user.id ? " · на вас" : "";
    const due = t.dueDate ? ` · до ${dt.format(t.dueDate)}` : "";
    return `• ${esc(t.title)} - ${esc(taskStatus(t.status).label)}${due}${mine}`;
  });

  return sendMessage(chatId, `<b>Незакрытые задачи</b>\n\n${lines.join("\n")}`, [
    [{ text: "Открыть в админке", url: absoluteUrl("/admin/tasks") }],
  ]);
}
