/**
 * Справочник событий уведомлений, которые добавлены после переноса.
 *
 * Таблица notification_events пришла со старого сайта и осталась
 * справочником: код события в notification_log - просто строка, внешнего
 * ключа к справочнику нет. Поэтому новые события не ломаются, если строки
 * в справочнике ещё нет, но в админке их полагается видеть с человеческим
 * названием. Запись в базу делает `scripts/seed-notification-events.mjs`
 * (его же зовёт deploy.sh), а список живёт здесь, чтобы его видели и код,
 * и проверка.
 *
 * Коды в стиле справочника - «раздел.событие». Старые коды в самом
 * приложении (order_created, order_message ...) не переименовываем: по
 * ним уже есть записи в журнале.
 */

export type NotifyEventDef = {
  code: string;
  name: string;
  description: string;
  category: "orders" | "tasks" | "warehouse" | "crm" | "production" | "finance" | "system";
};

export const EVENTS = {
  ticketNew: "support.ticket_new",
  ticketReply: "support.ticket_reply",
  clientUpload: "client.upload",
  reviewNew: "review.new",
  /** Уже есть в справочнике со старого сайта. */
  crmReminder: "crm.reminder",
  taskDeadline: "task.deadline",
} as const;

/** Только то, чего в справочнике со старого сайта не было. */
export const NEW_EVENTS: readonly NotifyEventDef[] = [
  {
    code: EVENTS.ticketNew,
    name: "Новое обращение в поддержку",
    description: "Клиент завёл обращение в личном кабинете",
    category: "orders",
  },
  {
    code: EVENTS.ticketReply,
    name: "Ответ клиента в обращении",
    description: "Клиент дописал в уже открытое обращение",
    category: "orders",
  },
  {
    code: EVENTS.clientUpload,
    name: "Клиент загрузил макет",
    description: "В кабинете появился файл на проверку",
    category: "orders",
  },
  {
    code: EVENTS.reviewNew,
    name: "Новый отзыв на модерации",
    description: "Клиент оставил отзыв о товаре, он ждёт проверки",
    category: "orders",
  },
];
