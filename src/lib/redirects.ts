/**
 * Редиректы со старого сайта.
 *
 * Адреса на PHP-сайте складывались годами: часть лежала «чистыми» путями
 * из .htaccess, часть - прямыми ссылками на .php, часть - с номером в
 * строке запроса. Всё это разошлось по закладкам, письмам и выдаче
 * поисковиков, поэтому на новом сайте каждый живой старый адрес обязан
 * приводить туда, где теперь лежит то же самое.
 *
 * Правила проверяются по порядку, побеждает первое совпадение, поэтому
 * частные случаи (`/admin/materials/edit?id=7`) стоят выше общих
 * (`/admin/materials/edit`).
 *
 * Чего здесь намеренно нет:
 *   • `/404.php` - страница ошибки. Редирект с неё на главную превратил
 *     бы ошибку в «мягкую 404», которую поисковики считают хуже честной;
 *   • служебные `security_check.php`, `test_upd_generation.php` -
 *     им положено отвечать 404;
 *   • ajax- и api-эндпоинты старого сайта: у нового другие адреса,
 *     форматы и методы, редирект тут только маскировал бы поломку;
 *   • разделы без нового дома (рассылки, партнёры, выгрузка в 1С) -
 *     пусть честно отвечают 404, пока их не перенесли.
 */

export type LegacyRedirect = {
  source: string;
  destination: string;
  /**
   * 301, а не 308 из `permanent: true`. Разница в том, что 308 обязывает
   * повторить тот же метод, и старые роботы его знают хуже: для Яндекса,
   * с которого идёт заметная часть трафика, 301 - самый предсказуемый
   * ответ. Ссылки, по которым переходят, всё равно GET.
   */
  statusCode: 301;
  has?: { type: "query"; key: string; value?: string }[];
};

/** Правило вида «страница с номером в строке запроса». */
function withId(
  source: string,
  destination: string,
  key = "id",
): LegacyRedirect {
  return {
    source,
    destination,
    has: [{ type: "query", key, value: "(?<legacyId>\\d+)" }],
    statusCode: 301,
  };
}

/** Простое правило «адрес → адрес». */
function to(source: string, destination: string): LegacyRedirect {
  return { source, destination, statusCode: 301 };
}

/** `/about.php` → `/about` для списка путей. */
function dropPhp(paths: string[]): LegacyRedirect[] {
  return paths.map((p) => to(`${p}.php`, p));
}

// ------------------------------------------------------------ витрина

const storefront: LegacyRedirect[] = [
  to("/index.php", "/"),

  // Товар лежал по `/service?id=7`, ссылки в каталоге были именно такие.
  // Правило с номером стоит первым, иначе всё уедет в общий каталог
  withId("/service", "/catalog/:legacyId"),
  withId("/service.php", "/catalog/:legacyId"),
  to("/service/:legacyId(\\d+)", "/catalog/:legacyId"),
  to("/service", "/catalog"),
  to("/service.php", "/catalog"),

  // Единственная страница, где адрес поменялся по смыслу, а не из-за
  // расширения: было подчёркивание, стал дефис
  to("/payment_delivery", "/payment-delivery"),
  to("/payment_delivery.php", "/payment-delivery"),

  ...dropPhp([
    "/about",
    "/catalog",
    "/contacts",
    "/faq",
    "/favorites",
    "/cart",
    "/privacy",
    "/terms",
    "/requirements",
    "/login",
    "/register",
  ]),

  // Оформление заказа переехало на /checkout; корзина осталась
  // отдельным шагом перед ним
  to("/checkout.php", "/checkout"),
  to("/checkoutcart", "/cart"),
  to("/checkoutshopcart/:path+", "/cart"),

  // Выйти из старого сеанса нечему: сеансы разные, а выход в новом
  // сайте - действие формы, а не адрес
  to("/logout", "/login"),
  to("/logout.php", "/login"),

  // Восстановление пароля теперь есть и на новом сайте - редиректом
  // остаются только адреса с расширением
  to("/forgot-password.php", "/forgot-password"),
  to("/reset-password.php", "/reset-password"),
];

// ------------------------------------------------------------ кабинет

const cabinet: LegacyRedirect[] = [
  withId("/client/order_details", "/client/orders/:legacyId"),
  withId("/client/order_details.php", "/client/orders/:legacyId"),
  to("/client/order_details", "/client/orders"),
  to("/client/order_details.php", "/client/orders"),

  // УПД скачивался отдельной ссылкой по номеру заказа; теперь документы
  // по заказу перечислены на его странице в кабинете
  withId("/client/download_upd", "/client/orders/:legacyId", "order_id"),
  withId("/client/download_upd.php", "/client/orders/:legacyId", "order_id"),
  to("/client/download_upd", "/client/orders"),
  to("/client/download_upd.php", "/client/orders"),

  to("/client/mini_warehouse", "/client/warehouse"),
  to("/client/mini_warehouse.php", "/client/warehouse"),

  ...dropPhp([
    "/client/dashboard",
    "/client/settings",
    "/client/orders",
    "/client/uploads",
    "/client/support",
    "/client/editor",
  ]),
];

// ------------------------------------------------------------- админка

const admin: LegacyRedirect[] = [
  to("/admin/index.php", "/admin"),

  // Заказы
  to("/admin/order/details/:legacyId(\\d+)", "/admin/orders/:legacyId"),
  withId("/admin/order/details", "/admin/orders/:legacyId"),
  withId("/admin/order/details.php", "/admin/orders/:legacyId"),
  to("/admin/order/details", "/admin/orders"),
  to("/admin/order/details.php", "/admin/orders"),
  to("/admin/orders.php", "/admin/orders"),
  to("/admin/orderform", "/admin/orders"),
  to("/admin/order_form.php", "/admin/orders"),

  // Заказы менеджера
  withId("/admin/order/external_details", "/admin/external-orders/:legacyId"),
  withId("/admin/order/external_details.php", "/admin/external-orders/:legacyId"),
  to("/admin/order/external_details", "/admin/external-orders"),
  to("/admin/order/external_details.php", "/admin/external-orders"),
  to("/admin/order/external_orders", "/admin/external-orders"),
  to("/admin/order/external_orders.php", "/admin/external-orders"),
  // Заведение заказа теперь есть и в новой админке - ведём прямо туда
  to("/admin/order/add_external", "/admin/external-orders/new"),
  to("/admin/order/add_external.php", "/admin/external-orders/new"),

  // Товары: карточки, атрибуты и картинки собрались в один раздел
  withId("/admin/product/edit", "/admin/products/:legacyId"),
  withId("/admin/product/edit.php", "/admin/products/:legacyId"),
  to("/admin/product/:path+", "/admin/products"),
  to("/admin/products.php", "/admin/products"),
  to("/admin/edit-product", "/admin/products"),
  to("/admin/attributes", "/admin/products"),
  to("/admin/attributes.php", "/admin/products"),
  to("/admin/images", "/admin/products"),
  to("/admin/images.php", "/admin/products"),
  to("/admin/image/:path+", "/admin/products"),

  // Клиенты
  withId("/admin/client_card", "/admin/clients/:legacyId"),
  withId("/admin/client_card.php", "/admin/clients/:legacyId"),
  to("/admin/client_card", "/admin/clients"),
  to("/admin/client_card.php", "/admin/clients"),
  to("/admin/users", "/admin/clients"),
  to("/admin/users.php", "/admin/clients"),
  to("/admin/managers", "/admin/clients"),

  // Обращения из кабинета
  withId("/admin/support/view.php", "/admin/support/:legacyId"),
  to("/admin/support/view.php", "/admin/support"),
  to("/admin/support/index.php", "/admin/support"),

  // Сообщения с сайта и отзывы
  to("/admin/contacts/messages", "/admin/inbox"),
  to("/admin/contacts/messages.php", "/admin/inbox"),
  to("/admin/reviews", "/admin/inbox"),
  to("/admin/reviews.php", "/admin/inbox"),

  // CRM: лид стал просто страницей раздела
  to("/admin/crm/lead/:legacyId(\\d+)", "/admin/crm/:legacyId"),
  withId("/admin/crm/lead.php", "/admin/crm/:legacyId"),
  to("/admin/crm/index.php", "/admin/crm"),

  // Бухгалтерия. Внутренние страницы вели на записи с другими номерами,
  // поэтому все ведём в общий список, а не в наугад выбранную карточку
  to("/admin/buhgalt", "/admin/finance"),
  to("/admin/buhgalt/:path+", "/admin/finance"),
  to("/admin/statistic", "/admin/analytics"),
  to("/admin/statistic.php", "/admin/analytics"),
  to("/admin/analytics/index.php", "/admin/analytics"),

  // Производство и качество
  to("/admin/production/details", "/admin/production"),
  to("/admin/production/details/:path+", "/admin/production"),
  to("/admin/production/index.php", "/admin/production"),
  to("/admin/quality-control", "/admin/quality"),
  to("/admin/quality_control", "/admin/quality"),
  to("/admin/quality_control/:path+", "/admin/quality"),

  // Склад: у нового раздела есть страницы позиций, поэтому общее правило
  // «всё внутрь» тут поставить нельзя - перечисляем старые страницы
  withId("/admin/materials/edit", "/admin/materials/:legacyId"),
  withId("/admin/materials/edit.php", "/admin/materials/:legacyId"),
  to("/admin/materials/index.php", "/admin/materials"),
  to("/admin/materials/dashboard", "/admin/materials"),
  to("/admin/materials/add", "/admin/materials"),
  to("/admin/materials/edit", "/admin/materials"),
  to("/admin/materials/movements", "/admin/materials"),
  to("/admin/materials/movement_add", "/admin/materials"),
  to("/admin/materials/search", "/admin/materials"),

  // Закупки и поставщики
  to("/admin/purchase-orders", "/admin/purchases"),
  to("/admin/purchase-orders/:path+", "/admin/purchases"),
  to("/admin/purchase_orders", "/admin/purchases"),
  to("/admin/purchase_orders/:path+", "/admin/purchases"),
  // У подрядчиков теперь свой раздел, поэтому перечисляем страницы
  // старого сайта поимённо: общее правило перехватило бы новые адреса
  to("/admin/suppliers/index", "/admin/suppliers"),
  to("/admin/suppliers/index.php", "/admin/suppliers"),
  to("/admin/suppliers/add", "/admin/suppliers/new"),
  to("/admin/suppliers/add.php", "/admin/suppliers/new"),
  to("/admin/suppliers/edit", "/admin/suppliers"),
  to("/admin/suppliers/edit.php", "/admin/suppliers"),
  to("/admin/suppliers/details", "/admin/suppliers"),
  to("/admin/suppliers/details.php", "/admin/suppliers"),

  // Задачи: доска и список слились в один раздел
  to("/admin/kanban", "/admin/tasks"),
  to("/admin/kanban/:path+", "/admin/tasks"),
  to("/admin/tasks/:path+", "/admin/tasks"),

  // Документы. `/admin/documents/templates` есть и на новом сайте,
  // поэтому общего правила снова нет
  withId("/admin/documents/view", "/admin/documents/:legacyId"),
  withId("/admin/documents/view.php", "/admin/documents/:legacyId"),
  to("/admin/documents/index.php", "/admin/documents"),
  to("/admin/documents/view", "/admin/documents"),
  to("/admin/documents/create", "/admin/documents"),
  to("/admin/documents/edit", "/admin/documents"),
  to("/admin/documents/download", "/admin/documents"),
  to("/admin/documents/upd_list", "/admin/documents"),
  to("/admin/documents/generate_upd", "/admin/documents"),
  to("/admin/documents/template-edit", "/admin/documents/templates"),

  // Точка Банк, калькулятор, прайс-лист, предложения - везде было
  // несколько страниц, стало по одной
  to("/admin/tochka/:path+", "/admin/tochka"),
  to("/admin/calculator/:path+", "/admin/calculator"),
  to("/admin/calculator-settings", "/admin/calculator"),
  to("/admin/pricelist/:path+", "/admin/pricelist"),
  // У предложений перечисляем страницы поимённо, а не «всё, что под
  // /admin/offers»: заведение КП теперь живёт по адресу /admin/offers/new,
  // и общее правило перехватило бы его
  to("/admin/offers/create", "/admin/offers/new"),
  to("/admin/offers/create.php", "/admin/offers/new"),
  to("/admin/offers/index", "/admin/offers"),
  to("/admin/offers/index.php", "/admin/offers"),
  to("/admin/offers/edit", "/admin/offers"),
  to("/admin/offers/edit.php", "/admin/offers"),
  to("/admin/offers/view", "/admin/offers"),
  to("/admin/offers/view.php", "/admin/offers"),
  to("/admin/offers/download_pdf", "/admin/offers"),
  to("/admin/offers/download_pdf.php", "/admin/offers"),

  // Настройки
  to("/admin/tax_settings", "/admin/settings/company"),
  to("/admin/tax_settings.php", "/admin/settings/company"),
  to("/admin/seo/:path+", "/admin/seo"),
  to("/admin/telegram_setup", "/admin/telegram"),
  to("/admin/telegram_setup.php", "/admin/telegram"),
  to("/admin/notification-settings", "/admin/telegram"),
  to("/admin/notification_settings", "/admin/telegram"),
  to("/admin/notification_settings/:path+", "/admin/telegram"),
  to("/admin/notifications", "/admin/telegram"),
  to("/admin/notifications.php", "/admin/telegram"),

  to("/admin/discounts", "/admin/promocodes"),
  to("/admin/discounts.php", "/admin/promocodes"),
];

export const legacyRedirects: LegacyRedirect[] = [
  ...storefront,
  ...cabinet,
  ...admin,
];

/**
 * Вебхук телеграма - не редирект, а подмена адреса.
 *
 * Телеграм шлёт POST на тот адрес, который у него записан, и во время
 * переключения там ещё будет старый `/telegram_webhook`. Редирект бы не
 * помог: на 301 запрос повторяют как GET и тело теряется. Подмена же
 * отдаёт запрос новому обработчику как есть, так что бот не замолкает,
 * даже если вебхук перерегистрировать забыли.
 */
export const legacyRewrites = [
  { source: "/telegram_webhook", destination: "/api/telegram/webhook" },
  { source: "/telegram_webhook.php", destination: "/api/telegram/webhook" },
];
