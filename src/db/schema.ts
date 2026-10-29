/**
 * Схема PostgreSQL, полученная из боевого дампа MySQL.
 *
 * Сгенерировано: scripts/generate-schema.mjs
 * Источник: schema.sql (92 таблиц, 98 внешних ключей)
 *
 * Файл под контролем версий и правится руками - не перезаписывайте
 * генератором, не перенеся правки.
 */
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================== Перечисления ==============================

export const accountDeletionRequestsStatusEnum = pgEnum("account_deletion_requests_status", ["pending", "approved", "rejected"]);
export const clientUploadsStatusEnum = pgEnum("client_uploads_status", ["pending", "approved", "rejected", "revision"]);
export const commercialOffersStatusEnum = pgEnum("commercial_offers_status", ["draft", "sent", "accepted", "rejected", "expired"]);
export const contactMessagesPreferredContactEnum = pgEnum("contact_messages_preferred_contact", ["phone", "telegram", "whatsapp", "email"]);
export const contactMessagesStatusEnum = pgEnum("contact_messages_status", ["new", "read"]);
export const corporateAccountRequestsStatusEnum = pgEnum("corporate_account_requests_status", ["pending", "approved", "rejected"]);
export const crmInteractionsTypeEnum = pgEnum("crm_interactions_type", ["call", "email", "meeting", "telegram", "note", "task", "order"]);
export const crmInteractionsDirectionEnum = pgEnum("crm_interactions_direction", ["incoming", "outgoing"]);
export const crmLeadsSourceEnum = pgEnum("crm_leads_source", ["website", "phone", "email", "telegram", "referral", "cold_call", "advertising", "other"]);
export const crmLeadsStatusEnum = pgEnum("crm_leads_status", ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]);
export const crmLeadsPriorityEnum = pgEnum("crm_leads_priority", ["low", "medium", "high", "urgent"]);
export const documentsStatusEnum = pgEnum("documents_status", ["draft", "pending", "approved", "signed", "cancelled", "archived"]);
export const documentsDocTypeEnum = pgEnum("documents_doc_type", ["incoming", "internal", "outgoing", "accounting"]);
export const export1cLogExportTypeEnum = pgEnum("export_1c_log_export_type", ["orders", "products", "clients", "payments"]);
export const externalOrdersStatusEnum = pgEnum("external_orders_status", ["unpaid", "partial", "paid"]);
export const externalOrdersProductionStatusEnum = pgEnum("external_orders_production_status", ["pending", "processing", "in_work", "ready", "delayed", "shipped", "delivered", "cancelled", "completed"]);
export const externalOrderReadyHistoryChangeTypeEnum = pgEnum("external_order_ready_history_change_type", ["set", "prolong", "edit"]);
export const massMessagesMessageTypeEnum = pgEnum("mass_messages_message_type", ["email", "telegram", "both"]);
export const massMessagesTargetAudienceEnum = pgEnum("mass_messages_target_audience", ["all", "customers", "admins", "managers", "specific"]);
export const massMessagesStatusEnum = pgEnum("mass_messages_status", ["draft", "scheduled", "sending", "sent", "failed"]);
export const massMessageRecipientsEmailStatusEnum = pgEnum("mass_message_recipients_email_status", ["pending", "sent", "failed", "skipped"]);
export const massMessageRecipientsTelegramStatusEnum = pgEnum("mass_message_recipients_telegram_status", ["pending", "sent", "failed", "skipped"]);
export const materialsCategoryEnum = pgEnum("materials_category", ["paper", "vinyl", "banner", "film", "ink", "lamination", "other"]);
export const materialsMaterialTypeEnum = pgEnum("materials_material_type", ["sheet", "roll", "piece", "liquid"]);
export const materialsBatchesStatusEnum = pgEnum("materials_batches_status", ["active", "depleted", "expired", "returned"]);
export const materialsMovementsTypeEnum = pgEnum("materials_movements_type", ["in", "out"]);
export const materialsMovementsReferenceTypeEnum = pgEnum("materials_movements_reference_type", ["order", "manual", "purchase", "site_order"]);
export const miniWarehouseItemsStatusEnum = pgEnum("mini_warehouse_items_status", ["in_stock", "in_production", "shipped", "returned"]);
export const notificationsTypeEnum = pgEnum("notifications_type", ["info", "success", "warning", "error"]);
export const notificationsTargetAudienceEnum = pgEnum("notifications_target_audience", ["all", "clients", "admins", "managers"]);
export const notificationEventsCategoryEnum = pgEnum("notification_events_category", ["orders", "tasks", "warehouse", "crm", "production", "finance", "system"]);
export const notificationLogChannelEnum = pgEnum("notification_log_channel", ["email", "telegram", "flash"]);
export const notificationLogStatusEnum = pgEnum("notification_log_status", ["sent", "failed", "queued"]);
export const notificationPrefsPrefChannelEnum = pgEnum("notification_prefs_pref_channel", ["telegram", "email", "both"]);
export const notificationSubscriptionsChannelEnum = pgEnum("notification_subscriptions_channel", ["email", "telegram", "flash"]);
export const ordersStatusEnum = pgEnum("orders_status", ["pending", "processing", "in_work", "ready", "delayed", "shipped", "delivered", "cancelled", "completed"]);
export const ordersAccountingSourceEnum = pgEnum("orders_accounting_source", ["site", "external"]);
export const ordersAccountingStatusEnum = pgEnum("orders_accounting_status", ["unpaid", "partial", "paid"]);
export const ordersAccountingOldSourceEnum = pgEnum("orders_accounting_old_source", ["site", "external"]);
export const ordersAccountingOldStatusEnum = pgEnum("orders_accounting_old_status", ["unpaid", "partial", "paid"]);
export const orderPromocodesDiscountTypeEnum = pgEnum("order_promocodes_discount_type", ["percentage", "fixed"]);
export const orderReadyHistoryChangeTypeEnum = pgEnum("order_ready_history_change_type", ["set", "prolong", "edit"]);
export const pricingEquipmentTypeEnum = pgEnum("pricing_equipment_type", ["printer", "cutter", "laminator", "finisher", "other"]);
export const productionOrdersStatusEnum = pgEnum("production_orders_status", ["pending", "in_progress", "completed", "on_hold", "cancelled"]);
export const productionOrdersPriorityEnum = pgEnum("production_orders_priority", ["low", "medium", "high", "urgent"]);
export const productionOrderStagesStatusEnum = pgEnum("production_order_stages_status", ["pending", "in_progress", "completed", "skipped"]);
export const productionStageLogActionEnum = pgEnum("production_stage_log_action", ["created", "started", "completed", "skipped", "assigned", "comment", "returned"]);
export const productsTypeEnum = pgEnum("products_type", ["product", "service"]);
export const productsItemShapeEnum = pgEnum("products_item_shape", ["rectangle", "circle", "custom"]);
export const productAttributesTypeEnum = pgEnum("product_attributes_type", ["radio", "select", "text"]);
export const promocodesDiscountTypeEnum = pgEnum("promocodes_discount_type", ["percentage", "fixed"]);
export const purchaseOrdersStatusEnum = pgEnum("purchase_orders_status", ["draft", "sent", "confirmed", "in_delivery", "partially_received", "received", "cancelled"]);
export const purchaseOrdersPaymentStatusEnum = pgEnum("purchase_orders_payment_status", ["unpaid", "partial", "paid"]);
export const qcDefectsSeverityEnum = pgEnum("qc_defects_severity", ["minor", "major", "critical"]);
export const qcDefectsStatusEnum = pgEnum("qc_defects_status", ["open", "in_fix", "fixed", "wont_fix"]);
export const qcInspectionsResultEnum = pgEnum("qc_inspections_result", ["passed", "failed", "partial"]);
export const qcInspectionResultsStatusEnum = pgEnum("qc_inspection_results_status", ["ok", "fail", "na"]);
export const reviewsStatusEnum = pgEnum("reviews_status", ["pending", "approved", "rejected"]);
export const stockAlertsAlertTypeEnum = pgEnum("stock_alerts_alert_type", ["low_stock", "out_of_stock", "expiring_batch"]);
export const supportTicketsCategoryEnum = pgEnum("support_tickets_category", ["order_issue", "delivery", "payment", "quality", "design", "general"]);
export const supportTicketsPriorityEnum = pgEnum("support_tickets_priority", ["low", "normal", "high", "urgent"]);
export const supportTicketsStatusEnum = pgEnum("support_tickets_status", ["open", "in_progress", "waiting_client", "resolved", "closed"]);
export const tasksStatusEnum = pgEnum("tasks_status", ["pending", "in_progress", "completed", "cancelled"]);
export const tasksPriorityEnum = pgEnum("tasks_priority", ["low", "medium", "high", "urgent"]);
export const tochkaClosingDocumentsDocumentTypeEnum = pgEnum("tochka_closing_documents_document_type", ["act", "invoice", "waybill"]);
export const tochkaInvoicesPaymentStatusEnum = pgEnum("tochka_invoices_payment_status", ["waiting", "paid", "expired"]);
export const usersRoleEnum = pgEnum("users_role", ["user", "manager", "admin"]);

// ================================ Таблицы ================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  telegramChatId: varchar("telegram_chat_id", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  birthday: date("birthday", { mode: "string" }),
  emailNotifications: boolean("email_notifications").default(true),
  smsNotifications: boolean("sms_notifications").default(true),
  newsletter: boolean("newsletter").default(true),
  telegramNotifications: boolean("telegram_notifications").default(true),
  isCorporate: boolean("is_corporate").default(false),
  companyName: varchar("company_name", { length: 255 }),
  inn: varchar("inn", { length: 12 }),
  kpp: varchar("kpp", { length: 9 }),
  legalAddress: text("legal_address"),
  role: usersRoleEnum("role").default("user"),
  isBlocked: boolean("is_blocked").default(false).notNull(),
  canUseEditor: boolean("can_use_editor").default(false).notNull(),
  /**
   * Когда в последний раз менялся пароль. По этой отметке отзываются все
   * сессии, выданные до смены: токен, выписанный раньше, перестаёт
   * действовать. NULL - пароль с момента заведения не меняли.
   */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpires: timestamp("reset_token_expires", { mode: "date" }),
  shippingAddress: text("shipping_address"),
  rememberToken: varchar("remember_token", { length: 255 }),
  /** Дата и время истечения токена */
  rememberTokenExpiresAt: timestamp("remember_token_expires_at", { mode: "date" }),
  /** 1 - онлайн, 0 - офлайн */
  isOnline: boolean("is_online").default(false),
  /** Время последней активности */
  lastActivity: timestamp("last_activity", { withTimezone: true, mode: "date" }),
  /** Включить мини-склад для клиента */
  miniWarehouseEnabled: boolean("mini_warehouse_enabled").default(false),
  /**
   * Секрет одноразовых кодов (TOTP), base32. Появляется при настройке
   * второго фактора и живёт до его отключения.
   */
  totpSecret: varchar("totp_secret", { length: 64 }),
  /**
   * Момент, когда второй фактор подтверждён кодом. Пока пусто - секрет
   * заведён, но вход по нему не требуем: иначе человек, не успевший
   * добавить код в приложение, запер бы себя сам.
   */
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true, mode: "date" }),
  /**
   * Номер последнего принятого тридцатисекундного окна одноразового кода.
   * Код принимается, только если его окно строго позже этого номера, и
   * запись обновляется одним UPDATE ... WHERE: так подсмотренный код
   * нельзя предъявить второй раз, даже двумя запросами одновременно.
   */
  totpLastCounter: bigint("totp_last_counter", { mode: "number" }),
  /**
   * Версия сессий пользователя. Кладётся в JWT при входе и сверяется при
   * каждом чтении сессии; рост счётчика (смена пароля, блокировка,
   * «выйти со всех устройств») отзывает все выданные токены.
   */
  sessionVersion: integer("session_version").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).$onUpdate(() => new Date()),
}, (t) => [
  unique("users_email").on(t.email),
  index("users_idx_users_role").on(t.role),
  index("users_idx_users_is_blocked").on(t.isBlocked),
  index("users_idx_users_is_corporate").on(t.isCorporate),
  index("users_idx_users_created_at").on(t.createdAt),
  index("users_idx_users_can_use_editor").on(t.canUseEditor),
]);

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  status: accountDeletionRequestsStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  processedBy: integer("processed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
}, (t) => [
  index("account_deletion_requests_user_id").on(t.userId),
  index("account_deletion_requests_processed_by").on(t.processedBy),
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  discount: numeric("discount", { precision: 5, scale: 2 }).default("0.00"),
  isPopular: boolean("is_popular").default(false),
  isHidden: boolean("is_hidden").default(false).notNull(),
  categoryId: integer("category_id"),
  type: productsTypeEnum("type").default("product"),
  /** Кратность заказа (например, 10 штук) */
  multiplicity: integer("multiplicity").default(1).notNull(),
  /** Минимальное количество для заказа */
  minQuantity: integer("min_quantity").default(1).notNull(),
  /** Единица измерения */
  unit: varchar("unit", { length: 50 }).default("шт."),
  /** Себестоимость материалов (расчёт) */
  calcMaterialCost: numeric("calc_material_cost", { precision: 12, scale: 2 }),
  /** Себестоимость работы (расчёт) */
  calcLaborCost: numeric("calc_labor_cost", { precision: 12, scale: 2 }),
  /** Накладные расходы (расчёт) */
  calcOverhead: numeric("calc_overhead", { precision: 12, scale: 2 }),
  /** Общая себестоимость (расчёт) */
  calcTotalCost: numeric("calc_total_cost", { precision: 12, scale: 2 }),
  /** Дата последнего расчёта */
  calcUpdatedAt: timestamp("calc_updated_at", { withTimezone: true, mode: "date" }),
  /** Ширина изделия в мм */
  itemWidthMm: numeric("item_width_mm", { precision: 10, scale: 2 }),
  /** Высота изделия в мм */
  itemHeightMm: numeric("item_height_mm", { precision: 10, scale: 2 }),
  /** Диаметр изделия в мм (для круглых) */
  itemDiameterMm: numeric("item_diameter_mm", { precision: 10, scale: 2 }),
  /** Форма изделия */
  itemShape: productsItemShapeEnum("item_shape").default("rectangle"),
  /** Отступ между изделиями при резке (мм) */
  cuttingMarginMm: numeric("cutting_margin_mm", { precision: 5, scale: 2 }).default("2.00"),
});

export const productAttributes = pgTable("product_attributes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: productAttributesTypeEnum("type").default("radio"),
}, (t) => [
  index("product_attributes_product_id").on(t.productId),
]);

export const attributeValues = pgTable("attribute_values", {
  id: serial("id").primaryKey(),
  attributeId: integer("attribute_id").notNull().references(() => productAttributes.id, { onDelete: "cascade" }),
  value: varchar("value", { length: 255 }).notNull(),
  priceModifier: numeric("price_modifier", { precision: 10, scale: 2 }).default("0.00"),
}, (t) => [
  index("attribute_values_attribute_id").on(t.attributeId),
]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  /** ID пользователя (NULL для системных действий) */
  userId: integer("user_id"),
  /** Тип действия (order.create, user.block, finance.expense.add, и т.д.) */
  action: varchar("action", { length: 100 }).notNull(),
  /** Тип сущности (order, user, product, document, material) */
  entityType: varchar("entity_type", { length: 50 }),
  /** ID сущности */
  entityId: integer("entity_id"),
  /** Дополнительные данные в формате JSON */
  details: jsonb("details"),
  /** IP-адрес (поддержка IPv6) */
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("audit_log_idx_user_id").on(t.userId),
  index("audit_log_idx_action").on(t.action),
  index("audit_log_idx_entity").on(t.entityType, t.entityId),
  index("audit_log_idx_created_at").on(t.createdAt),
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  // restrict: клиента с заказами удалить нельзя - вместе с ним пропали бы
  // заказы, а с ними выручка и история. Человека убирают отключением входа
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  isUrgent: boolean("is_urgent").default(false).notNull(),
  status: ordersStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  readyDate: timestamp("ready_date", { mode: "date" }),
  shippingAddress: text("shipping_address").notNull(),
  contactInfo: text("contact_info").notNull(),
  isNew: boolean("is_new").default(true).notNull(),
  /**
   * Показывать ли клиенту счёт и УПД по этому заказу.
   *
   * Выключено по умолчанию: документы выставляются, когда состав и сумма
   * согласованы. До этого клиент увидел бы черновик и пошёл бы по нему
   * платить не ту сумму.
   */
  documentsVisible: boolean("documents_visible").default(false).notNull(),
  /**
   * Одноразовый ключ оформления (uuid из скрытого поля формы). Двойной
   * щелчок или повтор запроса приходят с тем же ключом, и вместо второго
   * заказа клиента отправляют на уже созданный. У перенесённых и
   * заведённых иначе заказов пусто.
   */
  checkoutToken: varchar("checkout_token", { length: 36 }),
}, (t) => [
  index("orders_user_id").on(t.userId),
  uniqueIndex("orders_checkout_token_unique").on(t.checkoutToken),
  index("orders_idx_orders_status").on(t.status),
  index("orders_idx_orders_is_urgent").on(t.isUrgent),
  index("orders_idx_orders_created_at").on(t.createdAt),
]);

export const orderChats = pgTable("order_chats", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  /** ID назначенного менеджера/админа */
  assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  unique("order_chats_unique_order").on(t.orderId),
  index("order_chats_fk_chat_order").on(t.orderId),
  index("order_chats_fk_chat_assigned_user").on(t.assignedUserId),
]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => orderChats.id, { onDelete: "cascade" }),
  // no action, а не restrict: проверка в конце оператора. Удаляя клиента,
  // каскад сначала уберёт его чаты (а с ними и сообщения), а сообщения
  // сотрудника в чужих чатах по-прежнему не дадут его удалить
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("chat_messages_fk_message_chat").on(t.chatId),
  index("chat_messages_fk_message_user").on(t.userId),
]);

export const chatMessageReads = pgTable("chat_message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  unique("chat_message_reads_unique_user_message_read").on(t.messageId, t.userId),
  index("chat_message_reads_fk_read_message").on(t.messageId),
  index("chat_message_reads_fk_read_user").on(t.userId),
]);

export const clientUploads = pgTable("client_uploads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").default(0).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  description: varchar("description", { length: 500 }),
  status: clientUploadsStatusEnum("status").default("pending"),
  adminComment: text("admin_comment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("client_uploads_idx_user").on(t.userId),
  index("client_uploads_idx_order").on(t.orderId),
  index("client_uploads_idx_status").on(t.status),
]);

export const commercialOffers = pgTable("commercial_offers", {
  id: serial("id").primaryKey(),
  /** Номер КП */
  number: varchar("number", { length: 50 }).notNull(),
  /**
   * Контрагент, если предложение делают заведённому заказчику.
   * Необязательный: КП часто пишут тому, кто ещё ничего не заказывал.
   */
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientCompany: varchar("client_company", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientAddress: text("client_address"),
  /** Срок действия */
  validUntil: date("valid_until", { mode: "string" }),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0.00"),
  /** Срок изготовления в рабочих днях */
  productionDays: integer("production_days"),
  /** Процент предоплаты (0 = отложенная оплата, 100 = полная предоплата) */
  prepaymentPercent: numeric("prepayment_percent", { precision: 5, scale: 2 }).default("100.00"),
  /** Дополнительные условия оплаты */
  paymentTerms: varchar("payment_terms", { length: 255 }),
  notes: text("notes"),
  status: commercialOffersStatusEnum("status").default("draft"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).default("0.00"),
  createdBy: integer("created_by"),
  /**
   * Заказ, созданный из этого КП. По нему повторное нажатие «создать
   * заказ» отправляет на уже созданный, а не заводит второй.
   */
  externalOrderId: integer("external_order_id").references(() => externalOrders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("commercial_offers_idx_number").on(t.number),
  index("commercial_offers_external_order_id").on(t.externalOrderId),
  index("commercial_offers_idx_status").on(t.status),
  index("commercial_offers_idx_created_by").on(t.createdBy),
]);

export const priceCategories = pgTable("price_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("price_categories_idx_active_order").on(t.isActive, t.sortOrder),
]);

export const priceItems = pgTable("price_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => priceCategories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 50 }).default("шт."),
  /** Минимальная цена (от) */
  priceMin: numeric("price_min", { precision: 12, scale: 2 }),
  /** Максимальная цена (до) */
  priceMax: numeric("price_max", { precision: 12, scale: 2 }),
  /** Фиксированная цена */
  priceFixed: numeric("price_fixed", { precision: 12, scale: 2 }),
  /** Примечание к цене (например, "от 100 шт.") */
  priceNote: varchar("price_note", { length: 255 }),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("price_items_idx_category").on(t.categoryId),
  index("price_items_idx_active_order").on(t.isActive, t.sortOrder),
]);

export const commercialOfferItems = pgTable("commercial_offer_items", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").notNull().references(() => commercialOffers.id, { onDelete: "cascade" }),
  /** Ссылка на позицию прайса (может быть NULL для кастомных позиций) */
  priceItemId: integer("price_item_id").references(() => priceItems.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 50 }).default("шт."),
  quantity: integer("quantity").default(1).notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("commercial_offer_items_idx_offer").on(t.offerId),
  index("commercial_offer_items_idx_price_item").on(t.priceItemId),
]);

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  preferredContact: contactMessagesPreferredContactEnum("preferred_contact").default("email"),
  message: text("message").notNull(),
  agreement: boolean("agreement").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  status: contactMessagesStatusEnum("status").default("new").notNull(),
});

export const corporateAccountRequests = pgTable("corporate_account_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  inn: varchar("inn", { length: 12 }).notNull(),
  kpp: varchar("kpp", { length: 9 }),
  legalAddress: text("legal_address"),
  status: corporateAccountRequestsStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  processedBy: integer("processed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
}, (t) => [
  index("corporate_account_requests_user_id").on(t.userId),
  index("corporate_account_requests_processed_by").on(t.processedBy),
]);

export const crmLeads = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  /** Имя контакта / компании */
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  source: crmLeadsSourceEnum("source").default("website"),
  status: crmLeadsStatusEnum("status").default("new"),
  priority: crmLeadsPriorityEnum("priority").default("medium"),
  /** Ответственный менеджер */
  assignedTo: integer("assigned_to"),
  /** Привязка к зарегистрированному пользователю */
  userId: integer("user_id"),
  /**
   * Контрагент, в которого лид превратился. Появляется в момент, когда
   * с лидом договорились: дальше он живёт уже как заказчик.
   */
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  /** Ожидаемая сумма сделки */
  expectedRevenue: numeric("expected_revenue", { precision: 15, scale: 2 }),
  expectedCloseDate: date("expected_close_date", { mode: "string" }),
  /** Причина проигрыша */
  lossReason: text("loss_reason"),
  notes: text("notes"),
  tags: varchar("tags", { length: 500 }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("crm_leads_idx_status").on(t.status),
  index("crm_leads_idx_assigned").on(t.assignedTo),
  index("crm_leads_idx_source").on(t.source),
  index("crm_leads_idx_user").on(t.userId),
]);

export const crmInteractions = pgTable("crm_interactions", {
  id: serial("id").primaryKey(),
  /** Привязка к лиду */
  leadId: integer("lead_id").references(() => crmLeads.id, { onDelete: "cascade" }),
  /** Привязка к клиенту (users) */
  userId: integer("user_id"),
  type: crmInteractionsTypeEnum("type").notNull(),
  /** Для звонков/писем */
  direction: crmInteractionsDirectionEnum("direction"),
  subject: varchar("subject", { length: 255 }),
  description: text("description"),
  /** Результат взаимодействия */
  result: text("result"),
  /** Продолжительность (для звонков/встреч) */
  durationMinutes: integer("duration_minutes"),
  /** Запланировано на */
  scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("crm_interactions_idx_lead").on(t.leadId),
  index("crm_interactions_idx_user").on(t.userId),
  index("crm_interactions_idx_type").on(t.type),
  index("crm_interactions_idx_scheduled").on(t.scheduledAt),
]);

export const crmReminders = pgTable("crm_reminders", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  userId: integer("user_id"),
  interactionId: integer("interaction_id"),
  remindAt: timestamp("remind_at", { mode: "date" }).notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  isCompleted: boolean("is_completed").default(false),
  /** Кому напомнить */
  assignedTo: integer("assigned_to").notNull(),
  /**
   * Для какого `remind_at` исполнителю уже ушло напоминание. Не флажок, а
   * сама дата: перенесли напоминание на другой срок - значение перестало
   * совпадать, и оно сработает снова. Пишет планировщик (api/cron/run).
   */
  notifiedRemindAt: timestamp("notified_remind_at", { mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("crm_reminders_idx_remind").on(t.remindAt, t.isCompleted),
  index("crm_reminders_idx_assigned").on(t.assignedTo),
]);

export const discounts = pgTable("discounts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  discountValue: numeric("discount_value", { precision: 5, scale: 2 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
}, (t) => [
  index("discounts_product_id").on(t.productId),
]);

export const documentCategories = pgTable("document_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }).default("fa-file-alt"),
  color: varchar("color", { length: 20 }).default("gray"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("document_categories_slug").on(t.slug),
]);

export const documentTemplates = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => documentCategories.id, { onDelete: "set null" }),
  name: varchar("name", { length: 150 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  /** HTML шаблон с плейсхолдерами {{field_name}} */
  contentTemplate: text("content_template"),
  /** JSON схема полей документа */
  fieldsSchema: jsonb("fields_schema"),
  /** Автонумерация документов */
  isNumbered: boolean("is_numbered").default(true),
  /** Префикс номера (напр. INV-, ACT-) */
  numberPrefix: varchar("number_prefix", { length: 20 }).default(""),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("document_templates_slug").on(t.slug),
  index("document_templates_category_id").on(t.categoryId),
]);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => documentTemplates.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => documentCategories.id, { onDelete: "set null" }),
  /** Привязка к заказу */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  /** Клиент/контрагент */
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  /** Номер документа */
  documentNumber: varchar("document_number", { length: 50 }),
  title: varchar("title", { length: 255 }).notNull(),
  /** HTML содержимое документа */
  content: text("content"),
  /** Данные полей в JSON */
  dataJson: jsonb("data_json"),
  status: documentsStatusEnum("status").default("draft"),
  docType: documentsDocTypeEnum("doc_type").default("internal"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("RUB"),
  /** Дата документа */
  documentDate: date("document_date", { mode: "string" }),
  /** Срок действия */
  validUntil: date("valid_until", { mode: "string" }),
  /** Путь к PDF/файлу */
  filePath: varchar("file_path", { length: 500 }),
  originalFilename: varchar("original_filename", { length: 255 }),
  fileSize: integer("file_size"),
  /** Кто подписал */
  signedBy: integer("signed_by"),
  signedAt: timestamp("signed_at", { mode: "date" }),
  clientSigned: boolean("client_signed").default(false),
  clientSignedAt: timestamp("client_signed_at", { mode: "date" }),
  /** Закреплён */
  isPinned: boolean("is_pinned").default(false),
  viewsCount: integer("views_count").default(0),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("documents_template_id").on(t.templateId),
  index("documents_category_id").on(t.categoryId),
  index("documents_created_by").on(t.createdBy),
  index("documents_idx_order").on(t.orderId),
  index("documents_idx_user").on(t.userId),
  index("documents_idx_status").on(t.status),
  index("documents_idx_doc_type").on(t.docType),
  index("documents_idx_document_date").on(t.documentDate),
  index("documents_idx_created_at").on(t.createdAt),
  // Частичный: у документов без номера (шаблон «не нумеровать») он пуст
  uniqueIndex("documents_document_number_unique")
    .on(t.documentNumber)
    .where(sql`${t.documentNumber} is not null`),
]);

export const documentHistory = pgTable("document_history", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  /** created, updated, status_changed, signed, viewed, downloaded */
  action: varchar("action", { length: 50 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  comment: text("comment"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("document_history_user_id").on(t.userId),
  index("document_history_idx_document").on(t.documentId),
  index("document_history_idx_created_at").on(t.createdAt),
]);

/**
 * Атомарные счётчики номеров: закупки, КП, обращения, документы.
 * Ключ вида `purchase:2026`, `offer:2026`, `ticket:20261028`,
 * `doc:СЧ-2026`. Выдаёт номера nextNumber (lib/numbering-db.ts) - одним
 * INSERT … ON CONFLICT DO UPDATE, поэтому два одновременных запроса
 * не получают один номер. Прежний `count(*) + 1` давал совпадения и
 * ошибку 500 на уникальном индексе.
 */
export const counters = pgTable("counters", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: integer("value").notNull().default(0),
});

export const documentNumberCounters = pgTable("document_number_counters", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => documentTemplates.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").default(0),
}, (t) => [
  unique("document_number_counters_unique_template_year").on(t.templateId, t.year),
]);

export const documentOrderLinks = pgTable("document_order_links", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  /** main, related, attachment */
  linkType: varchar("link_type", { length: 50 }).default("related"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("document_order_links_unique_doc_order").on(t.documentId, t.orderId),
  index("document_order_links_order_id").on(t.orderId),
]);

export const expensesCategories = pgTable("expenses_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const export1cLog = pgTable("export_1c_log", {
  id: serial("id").primaryKey(),
  /** Тип экспорта */
  exportType: export1cLogExportTypeEnum("export_type").notNull(),
  /** Имя файла экспорта */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** Количество записей */
  recordsCount: integer("records_count").default(0).notNull(),
  periodFrom: date("period_from", { mode: "string" }),
  periodTo: date("period_to", { mode: "string" }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("export_1c_log_created_by").on(t.createdBy),
]);

/**
 * Контрагенты - заказчики, которых менеджер заводит руками.
 *
 * Заказ менеджера раньше хранил имя, телефон и адрес строками прямо в
 * себе. Из-за этого один и тот же заказчик приходил заново каждый раз:
 * ни истории, ни возможности выбрать его в следующем заказе. Здесь он
 * заводится один раз и живёт отдельно от аккаунта на сайте: у части
 * заказчиков аккаунта нет и не будет.
 *
 * userId связывает контрагента с личным кабинетом, когда заказчик всё же
 * зарегистрировался. Связь ставится один раз на контрагента, а не на
 * каждый заказ: заказы подтягиваются в кабинет сами.
 */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  inn: varchar("inn", { length: 12 }),
  address: text("address"),
  notes: text("notes"),
  /** Аккаунт на сайте, если заказчик зарегистрировался. */
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("clients_idx_name").on(t.name),
  index("clients_idx_user").on(t.userId),
  index("clients_idx_phone").on(t.phone),
]);

export const externalOrders = pgTable("external_orders", {
  id: serial("id").primaryKey(),
  /**
   * Контрагент. Необязательный: у заказов, перенесённых со старого
   * сайта, его может не быть, и заказ всё равно должен открываться.
   */
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  /** Имя как его вписали в заказ - остаётся как было на момент заказа. */
  clientName: varchar("client_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  description: text("description"),
  status: externalOrdersStatusEnum("status").default("unpaid"),
  productionStatus: externalOrdersProductionStatusEnum("production_status").default("pending").notNull(),
  /**
   * Итог заказа. Руками не вписывается: его считает recalcOrderMoney как
   * сумму позиций плюс корректировка (adjustment). Раньше итог правили
   * отдельно от позиций, и после правки состава он молча расходился.
   */
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /**
   * Скидка (со знаком минус) или наценка на заказ целиком. Явная строка
   * вместо «итога, который отличается от суммы позиций»: так видно, откуда
   * взялась разница, и она переживает правку позиций.
   */
  adjustment: numeric("adjustment", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /** За что корректировка - «скидка 10 % по КП», «доставка». */
  adjustmentNote: varchar("adjustment_note", { length: 255 }),
  estimatedReadyDate: timestamp("estimated_ready_date", { mode: "date" }),
  /** Показывать ли клиенту счёт и УПД - см. orders.documentsVisible. */
  documentsVisible: boolean("documents_visible").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("external_orders_idx_external_orders_status").on(t.status),
  index("external_orders_idx_external_orders_created_at").on(t.createdAt),
  index("external_orders_idx_external_orders_production_status").on(t.productionStatus),
  index("external_orders_idx_client").on(t.clientId),
]);

export const externalOrderItems = pgTable("external_order_items", {
  id: serial("id").primaryKey(),
  externalOrderId: integer("external_order_id").notNull().references(() => externalOrders.id, { onDelete: "cascade" }),
  // set null: позиция остаётся с названием (item_name), даже если товар удалили
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  isCustom: boolean("is_custom").default(false).notNull(),
  itemName: varchar("item_name", { length: 255 }),
  itemDescription: text("item_description"),
  quantity: integer("quantity").default(1).notNull(),
  /** Сумма строки целиком, а не цена за штуку - так было на старом сайте. */
  price: numeric("price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /** Во что позиция обошлась нам: закупка, работа подрядчика, материал. */
  expenseAmount: numeric("expense_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /**
   * Позицию делает подрядчик, а не мы.
   *
   * Заказ перезаказывается то целиком, то частью, поэтому признак стоит
   * на позиции, а не на заказе: в одном заказе половина печатается у
   * себя, половина уходит на сторону.
   */
  isOutsourced: boolean("is_outsourced").default(false).notNull(),
  /** У кого перезаказано. Тот же справочник, что и у закупок. */
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
}, (t) => [
  index("external_order_items_external_order_id").on(t.externalOrderId),
  index("external_order_items_product_id").on(t.productId),
]);

export const externalOrderReadyHistory = pgTable("external_order_ready_history", {
  id: serial("id").primaryKey(),
  externalOrderId: integer("external_order_id").notNull(),
  previousDate: timestamp("previous_date", { mode: "date" }),
  newDate: timestamp("new_date", { mode: "date" }).notNull(),
  changeType: externalOrderReadyHistoryChangeTypeEnum("change_type").notNull(),
  reason: text("reason"),
  changedBy: integer("changed_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("external_order_ready_history_idx_external_order_id").on(t.externalOrderId),
]);

export const generalExpenses = pgTable("general_expenses", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  /**
   * Оплата закупки: расход заведён отметкой «Оплачено» на закупке. По этим
   * строкам считается purchase_orders.paid_amount, поэтому такой расход
   * нельзя удалить из бухгалтерии отдельно - только отменой оплаты.
   * set null: удалённая закупка не должна утащить за собой расход.
   */
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  expenseDate: timestamp("expense_date", { mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("general_expenses_category_id").on(t.categoryId),
  index("general_expenses_purchase_order_id").on(t.purchaseOrderId),
]);

export const massMessages = pgTable("mass_messages", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  messageType: massMessagesMessageTypeEnum("message_type").default("both").notNull(),
  targetAudience: massMessagesTargetAudienceEnum("target_audience").default("all").notNull(),
  /** For specific audience targeting */
  specificUserIds: jsonb("specific_user_ids"),
  status: massMessagesStatusEnum("status").default("draft").notNull(),
  scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  totalRecipients: integer("total_recipients").default(0),
  emailsSent: integer("emails_sent").default(0),
  telegramsSent: integer("telegrams_sent").default(0),
  emailsFailed: integer("emails_failed").default(0),
  telegramsFailed: integer("telegrams_failed").default(0),
}, (t) => [
  index("mass_messages_idx_status").on(t.status),
  index("mass_messages_idx_created_by").on(t.createdBy),
  index("mass_messages_idx_scheduled_at").on(t.scheduledAt),
]);

export const massMessageRecipients = pgTable("mass_message_recipients", {
  id: serial("id").primaryKey(),
  massMessageId: integer("mass_message_id").notNull().references(() => massMessages.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailStatus: massMessageRecipientsEmailStatusEnum("email_status").default("pending"),
  telegramStatus: massMessageRecipientsTelegramStatusEnum("telegram_status").default("pending"),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: "date" }),
  telegramSentAt: timestamp("telegram_sent_at", { withTimezone: true, mode: "date" }),
  emailError: text("email_error"),
  telegramError: text("telegram_error"),
}, (t) => [
  unique("mass_message_recipients_unique_message_user").on(t.massMessageId, t.userId),
  index("mass_message_recipients_idx_mass_message_id").on(t.massMessageId),
  index("mass_message_recipients_idx_user_id").on(t.userId),
]);

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),
  minStock: numeric("min_stock", { precision: 10, scale: 2 }).default("0.00"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  /** Категория для калькулятора */
  category: materialsCategoryEnum("category").default("other"),
  /** Активен в калькуляторе */
  isActive: boolean("is_active").default(true),
  /** Поставщик */
  supplier: varchar("supplier", { length: 255 }),
  /** Ширина материала в мм (для листа A4 = 210) */
  widthMm: numeric("width_mm", { precision: 10, scale: 2 }),
  /** Высота/длина материала в мм (для листа A4 = 297, для рулона = длина рулона) */
  heightMm: numeric("height_mm", { precision: 10, scale: 2 }),
  /** Тип: лист, рулон, штука, жидкость */
  materialType: materialsMaterialTypeEnum("material_type").default("sheet"),
});

export const materialsBatches = pgTable("materials_batches", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  /** Номер партии */
  batchNumber: varchar("batch_number", { length: 100 }).notNull(),
  /** Текущий остаток в партии */
  quantity: numeric("quantity", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /** Начальное количество */
  initialQuantity: numeric("initial_quantity", { precision: 10, scale: 2 }).notNull(),
  /** Цена за единицу в этой партии */
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),
  supplier: varchar("supplier", { length: 255 }),
  /** Дата поступления */
  receivedAt: date("received_at", { mode: "string" }).notNull(),
  /** Срок годности */
  expiresAt: date("expires_at", { mode: "string" }),
  status: materialsBatchesStatusEnum("status").default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("materials_batches_idx_material").on(t.materialId),
  index("materials_batches_idx_batch_number").on(t.batchNumber),
  index("materials_batches_idx_status").on(t.status),
  index("materials_batches_idx_expires").on(t.expiresAt),
]);

export const materialsMovements = pgTable("materials_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  type: materialsMovementsTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  referenceType: materialsMovementsReferenceTypeEnum("reference_type").notNull(),
  referenceId: integer("reference_id"),
  comment: text("comment"),
  /**
   * Приход, которым отменено списание: ссылка на отменяемое движение.
   * Уникальный индекс - одно списание вернуть на склад дважды нельзя,
   * даже если нажали «Вернуть» в двух вкладках.
   */
  reversesMovementId: integer("reverses_movement_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("materials_movements_material_id").on(t.materialId),
  uniqueIndex("materials_movements_reverses_unique").on(t.reversesMovementId),
  // Имя задано явно: сгенерированное длиннее 63 знаков, Postgres его обрезает
  // и push потом вечно предлагает пересоздать ключ (HANDOFF, п. 12)
  foreignKey({
    columns: [t.reversesMovementId],
    foreignColumns: [t.id],
    name: "materials_movements_reverses_fk",
  }).onDelete("set null"),
]);

export const materialsStock = pgTable("materials_stock", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).default("0.00").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("materials_stock_material_id").on(t.materialId),
]);

export const miniWarehouseItems = pgTable("mini_warehouse_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: integer("quantity").default(1).notNull(),
  status: miniWarehouseItemsStatusEnum("status").default("in_stock"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("mini_warehouse_items_user_id").on(t.userId),
  index("mini_warehouse_items_idx_status").on(t.status),
]);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }),
}, (t) => [
  unique("newsletter_subscribers_email").on(t.email),
]);

export const notificationEvents = pgTable("notification_events", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: notificationEventsCategoryEnum("category").notNull(),
  availableChannels: text("available_channels").default("email,telegram,flash"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("notification_events_code").on(t.code),
]);

export const notificationLog = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  eventCode: varchar("event_code", { length: 80 }).notNull(),
  channel: notificationLogChannelEnum("channel").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  metadata: jsonb("metadata"),
  status: notificationLogStatusEnum("status").default("sent"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("notification_log_idx_user").on(t.userId),
  index("notification_log_idx_event").on(t.eventCode),
  index("notification_log_idx_created").on(t.createdAt),
  index("notification_log_idx_status").on(t.status),
]);

export const notificationPrefs = pgTable("notification_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiveTaskCreated: boolean("receive_task_created").default(true).notNull(),
  receiveNewOrder: boolean("receive_new_order").default(true).notNull(),
  receiveTaskStatus: boolean("receive_task_status").default(true).notNull(),
  prefChannel: notificationPrefsPrefChannelEnum("pref_channel").default("both").notNull(),
  showTaskButtons: boolean("show_task_buttons").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("notification_prefs_uq_notification_prefs_user").on(t.userId),
]);

export const notificationSubscriptions = pgTable("notification_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventCode: varchar("event_code", { length: 80 }).notNull().references(() => notificationEvents.code, { onDelete: "cascade" }),
  channel: notificationSubscriptionsChannelEnum("channel").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("notification_subscriptions_uq_user_event_channel").on(t.userId, t.eventCode, t.channel),
  index("notification_subscriptions_idx_user").on(t.userId),
  index("notification_subscriptions_idx_event").on(t.eventCode),
]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: notificationsTypeEnum("type").default("info"),
  active: boolean("active").default(true),
  targetAudience: notificationsTargetAudienceEnum("target_audience").default("all"),
  startDate: timestamp("start_date", { mode: "date" }),
  endDate: timestamp("end_date", { mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("notifications_idx_notifications_dates").on(t.startDate, t.endDate),
  index("notifications_idx_notifications_audience").on(t.targetAudience),
  index("notifications_idx_notifications_active_dates").on(t.active, t.startDate, t.endDate),
]);

export const orderDocuments = pgTable("order_documents", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  /** upd - Универсальный передаточный документ, invoice - Счёт, act - Акт выполненных работ, contract - Договор */
  documentType: varchar("document_type", { length: 50 }).notNull(),
  /** Номер документа */
  documentNumber: varchar("document_number", { length: 100 }),
  /** Путь к файлу относительно корня проекта */
  filePath: varchar("file_path", { length: 255 }).notNull(),
  /** Размер файла в байтах */
  fileSize: integer("file_size"),
  /** ID пользователя, создавшего документ */
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).$onUpdate(() => new Date()),
}, (t) => [
  index("order_documents_idx_order_id").on(t.orderId),
  index("order_documents_idx_document_type").on(t.documentType),
  index("order_documents_idx_created_at").on(t.createdAt),
  index("order_documents_fk_order_documents_user").on(t.createdBy),
  index("order_documents_idx_order_type").on(t.orderId, t.documentType),
]);

export const ordersAccounting = pgTable("orders_accounting", {
  id: serial("id").primaryKey(),
  source: ordersAccountingSourceEnum("source").default("site").notNull(),
  /**
   * restrict: бухгалтерия не исчезает вместе с заказом, а заказ, у
   * которого есть карточка, удалить нельзя - его отменяют. Если заказ всё
   * же нужно стереть (например тестовый), карточку удаляют явно перед ним.
   */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "restrict" }),
  /**
   * Заказ менеджера. Удалить можно только заказ без платежей и списаний,
   * и тогда карточку удаляют вместе с ним (deleteExternalOrderChecked).
   * set null остался для старых карточек, чей заказ удалили раньше: они
   * помечены is_cancelled и в выручку не входят. Имя заказчика лежит
   * рядом строкой, так что карточка читается и без заказа.
   */
  externalOrderId: integer("external_order_id").references(() => externalOrders.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }),
  income: numeric("income", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalExpense: numeric("total_expense", { precision: 10, scale: 2 }).default("0.00").notNull(),
  estimatedExpense: numeric("estimated_expense", { precision: 10, scale: 2 }).default("0.00").notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  status: ordersAccountingStatusEnum("status").default("unpaid").notNull(),
  /**
   * Заказ отменён (или удалён, а карточка осталась). Карточка остаётся
   * для истории, но в выручку, долги и аналитику не входит. Ставит
   * recalcOrderMoney по статусу самого заказа.
   */
  isCancelled: boolean("is_cancelled").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("orders_accounting_order_id").on(t.orderId),
  index("orders_accounting_external_order_id").on(t.externalOrderId),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // set null: товар убрали из каталога, а позиция заказа остаётся -
  // название и характеристики лежат в item_name на момент заказа
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  isCustom: boolean("is_custom").default(false).notNull(),
  itemName: varchar("item_name", { length: 255 }),
  /**
   * Чистое название товара на момент заказа, без характеристик. В
   * item_name лежит «Название, Характеристика: значение», и группировать
   * по нему аналитику нельзя - продажи одного товара раздробились бы по
   * вариантам. Пусто у старых заказов и у своих позиций.
   */
  productName: varchar("product_name", { length: 255 }),
  itemNote: text("item_note"),
  /** Единица измерения на момент заказа. Пусто у старых заказов - тогда берётся из товара. */
  unit: varchar("unit", { length: 50 }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  attributes: jsonb("attributes"),
}, (t) => [
  index("order_items_order_id").on(t.orderId),
  index("order_items_product_id").on(t.productId),
]);

export const orderExpenses = pgTable("order_expenses", {
  id: serial("id").primaryKey(),
  orderAccountingId: integer("order_accounting_id").notNull().references(() => ordersAccounting.id, { onDelete: "cascade" }),
  // set null: расход принадлежит заказу, а не позиции - удалили позицию,
  // а затраты на неё остались в карточке
  orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
  materialName: varchar("material_name", { length: 255 }),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unit: varchar("unit", { length: 50 }),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }),
  categoryId: integer("category_id").references(() => expensesCategories.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  /**
   * Фактическое списание материала со склада на этот заказ.
   *
   * Отдельный признак, а не «material_name не пуст»: название материала
   * может оказаться и в строке, вписанной руками, а правило «факт
   * вытесняет оценку» должно срабатывать только на настоящее списание.
   * Пока у карточки есть хоть одно списание, строка расчётной
   * себестоимости в total_expense не входит - иначе материал считался бы
   * дважды: по рецептуре и по факту.
   */
  isWriteOff: boolean("is_write_off").default(false).notNull(),
  /**
   * Движение склада, которым материал списан. По нему «вернуть на склад»
   * знает материал и количество, не гадая по названию.
   */
  materialMovementId: integer("material_movement_id").references(() => materialsMovements.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  expenseDate: timestamp("expense_date", { mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("order_expenses_ibfk_2").on(t.categoryId),
  index("order_expenses_fk_order_expenses_accounting").on(t.orderAccountingId),
  index("order_expenses_idx_order_item_id").on(t.orderItemId),
  index("order_expenses_material_movement_id").on(t.materialMovementId),
]);

export const orderPayments = pgTable("order_payments", {
  id: serial("id").primaryKey(),
  orderAccountingId: integer("order_accounting_id").notNull().references(() => ordersAccounting.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { mode: "date" }).defaultNow(),
  note: text("note"),
  paymentDate: timestamp("payment_date", { mode: "date" }).defaultNow().notNull(),
  /**
   * Счёт Точки, по которому пришли деньги. Уникален: сверку с банком
   * запускают сколько угодно раз, а платёж по одному счёту должен
   * завестись ровно один.
   */
  tochkaInvoiceId: integer("tochka_invoice_id").references(() => tochkaInvoices.id, { onDelete: "set null" }),
}, (t) => [
  index("order_payments_order_accounting_id").on(t.orderAccountingId),
  unique("order_payments_tochka_invoice_id").on(t.tochkaInvoiceId),
]);

export const orderPromocodes = pgTable("order_promocodes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  promoCode: varchar("promo_code", { length: 50 }).notNull(),
  discountType: orderPromocodesDiscountTypeEnum("discount_type").notNull(),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  appliedDiscount: numeric("applied_discount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("order_promocodes_order_id").on(t.orderId),
]);

export const orderReadyHistory = pgTable("order_ready_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  previousDate: timestamp("previous_date", { mode: "date" }),
  newDate: timestamp("new_date", { mode: "date" }).notNull(),
  changeType: orderReadyHistoryChangeTypeEnum("change_type").notNull(),
  reason: text("reason"),
  changedBy: integer("changed_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("order_ready_history_idx_order_id").on(t.orderId),
]);

export const ordersAccountingOld = pgTable("orders_accounting_old", {
  id: serial("id").primaryKey(),
  source: ordersAccountingOldSourceEnum("source").notNull(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }),
  description: text("description"),
  income: numeric("income", { precision: 10, scale: 2 }).default("0.00"),
  totalExpense: numeric("total_expense", { precision: 10, scale: 2 }).default("0.00"),
  estimatedExpense: numeric("estimated_expense", { precision: 10, scale: 2 }).default("0.00"),
  status: ordersAccountingOldStatusEnum("status").default("unpaid"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("orders_accounting_old_order_id").on(t.orderId),
]);

export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: varchar("logo_url", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const passwordResetAttempts = pgTable("password_reset_attempts", {
  id: serial("id").primaryKey(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("password_reset_attempts_idx_ip_created").on(t.ipAddress, t.createdAt),
  index("password_reset_attempts_idx_email_created").on(t.email, t.createdAt),
]);

export const pricingCalculations = pgTable("pricing_calculations", {
  id: serial("id").primaryKey(),
  /** Название расчёта */
  name: varchar("name", { length: 255 }),
  /** Связь с товаром на сайте */
  productId: integer("product_id"),
  /** Тип расчёта */
  productType: varchar("product_type", { length: 100 }).default("custom"),
  /** Входные данные */
  inputData: jsonb("input_data").notNull(),
  /** Детализация расчёта */
  calculationData: jsonb("calculation_data").notNull(),
  /** Себестоимость */
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }).default("0.00"),
  /** Итоговая цена */
  finalPrice: numeric("final_price", { precision: 12, scale: 2 }).default("0.00"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("pricing_calculations_idx_product").on(t.productId),
  index("pricing_calculations_idx_created_by").on(t.createdBy),
  index("pricing_calculations_idx_created_at").on(t.createdAt),
]);

export const pricingEquipment = pgTable("pricing_equipment", {
  id: serial("id").primaryKey(),
  /** Название оборудования */
  name: varchar("name", { length: 255 }).notNull(),
  type: pricingEquipmentTypeEnum("type").default("other"),
  /** Стоимость работы в час */
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).default("0.00").notNull(),
  /** Производительность в час (м²) */
  speedSqmHour: numeric("speed_sqm_hour", { precision: 10, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("pricing_equipment_idx_type").on(t.type),
]);

export const pricingSettings = pgTable("pricing_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value").notNull(),
  description: varchar("description", { length: 255 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("pricing_settings_idx_key").on(t.settingKey),
]);

export const productExpenses = pgTable("product_expenses", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  materialName: varchar("material_name", { length: 255 }).notNull(),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 10, scale: 4 }).default("1.0000").notNull(),
  unit: varchar("unit", { length: 50 }),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),
}, (t) => [
  index("product_expenses_product_id").on(t.productId),
]);

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url", { length: 255 }).notNull(),
  isMain: boolean("is_main").default(false),
  /**
   * `logo` - значок вида работы для каталога, `photo` - пример готовой
   * работы для карточки товара. Значение по умолчанию делает фотографией
   * всё, что перенесено со старого сайта: там разделения не было.
   */
  kind: varchar("kind", { length: 10 }).default("photo").notNull(),
}, (t) => [
  index("product_images_product_id").on(t.productId),
]);

export const productMaterials = pgTable("product_materials", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  /** Количество изделий на лист (авторасчёт или вручную) */
  itemsPerSheet: integer("items_per_sheet"),
  /** Авторасчёт количества на лист */
  isAutoCalculated: boolean("is_auto_calculated").default(true),
}, (t) => [
  index("product_materials_product_id").on(t.productId),
  index("product_materials_material_id").on(t.materialId),
]);

export const productQuantityPrices = pgTable("product_quantity_prices", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
}, (t) => [
  index("product_quantity_prices_product_id").on(t.productId),
]);

export const productionStages = pgTable("production_stages", {
  id: serial("id").primaryKey(),
  /** Название этапа */
  name: varchar("name", { length: 255 }).notNull(),
  /** Системное имя */
  slug: varchar("slug", { length: 50 }).notNull(),
  /** Описание этапа */
  description: text("description"),
  /** FontAwesome иконка */
  icon: varchar("icon", { length: 50 }).default("fa-cog"),
  /** Цвет для UI */
  color: varchar("color", { length: 20 }).default("blue"),
  /** Нормативное время (часы) */
  defaultDurationHours: numeric("default_duration_hours", { precision: 5, scale: 2 }).default("0.00"),
  /** Порядок в цепочке */
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("production_stages_slug").on(t.slug),
]);

export const productionOrders = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  /** Заказ с сайта */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
  /** Заказ менеджера */
  externalOrderId: integer("external_order_id").references(() => externalOrders.id, { onDelete: "cascade" }),
  status: productionOrdersStatusEnum("status").default("pending"),
  priority: productionOrdersPriorityEnum("priority").default("medium"),
  /** Текущий активный этап */
  currentStageId: integer("current_stage_id").references(() => productionStages.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  /** Крайний срок */
  deadline: timestamp("deadline", { mode: "date" }),
  notes: text("notes"),
  /** Кто запустил в производство */
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("production_orders_idx_order_id").on(t.orderId),
  index("production_orders_idx_external_order_id").on(t.externalOrderId),
  index("production_orders_idx_status").on(t.status),
  index("production_orders_idx_current_stage").on(t.currentStageId),
]);

export const productionOrderStages = pgTable("production_order_stages", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  stageId: integer("stage_id").notNull().references(() => productionStages.id, { onDelete: "restrict" }),
  status: productionOrderStagesStatusEnum("status").default("pending"),
  /** Исполнитель */
  assignedTo: integer("assigned_to"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  /** Плановые часы */
  estimatedHours: numeric("estimated_hours", { precision: 5, scale: 2 }),
  /** Фактические часы */
  actualHours: numeric("actual_hours", { precision: 5, scale: 2 }),
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
}, (t) => [
  index("production_order_stages_idx_production_order").on(t.productionOrderId),
  index("production_order_stages_idx_stage").on(t.stageId),
  index("production_order_stages_idx_status").on(t.status),
  index("production_order_stages_idx_assigned").on(t.assignedTo),
]);

export const productionStageLog = pgTable("production_stage_log", {
  id: serial("id").primaryKey(),
  productionOrderStageId: integer("production_order_stage_id").notNull().references(() => productionOrderStages.id, { onDelete: "cascade" }),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  action: productionStageLogActionEnum("action").notNull(),
  userId: integer("user_id"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("production_stage_log_idx_stage_instance").on(t.productionOrderStageId),
  index("production_stage_log_idx_production_order").on(t.productionOrderId),
]);

export const promocodes = pgTable("promocodes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull(),
  discountType: promocodesDiscountTypeEnum("discount_type").default("percentage"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").default(0),
  minOrderAmount: numeric("min_order_amount", { precision: 10, scale: 2 }),
  maxDiscountAmount: numeric("max_discount_amount", { precision: 10, scale: 2 }),
  startDate: timestamp("start_date", { mode: "date" }),
  endDate: timestamp("end_date", { mode: "date" }),
  description: text("description"),
  isSingleUse: boolean("is_single_use").default(false).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("promocodes_code").on(t.code),
]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 100 }),
  website: varchar("website", { length: 255 }),
  address: text("address"),
  serviceCost: numeric("service_cost", { precision: 10, scale: 2 }),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 50 }).notNull(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
  status: purchaseOrdersStatusEnum("status").default("draft"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).default("0.00"),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }).default("0.00"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  expectedDeliveryDate: date("expected_delivery_date", { mode: "string" }),
  actualDeliveryDate: date("actual_delivery_date", { mode: "string" }),
  createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  paymentStatus: purchaseOrdersPaymentStatusEnum("payment_status").default("unpaid"),
  paymentMethod: varchar("payment_method", { length: 100 }),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("purchase_orders_order_number").on(t.orderNumber),
  index("purchase_orders_idx_supplier").on(t.supplierId),
  index("purchase_orders_idx_status").on(t.status),
  index("purchase_orders_idx_created_by").on(t.createdBy),
  index("purchase_orders_idx_expected_delivery").on(t.expectedDeliveryDate),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }),
  receivedQuantity: numeric("received_quantity", { precision: 10, scale: 2 }).default("0.00"),
  notes: varchar("notes", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("purchase_order_items_idx_purchase_order").on(t.purchaseOrderId),
  index("purchase_order_items_idx_material").on(t.materialId),
]);

export const qcChecklists = pgTable("qc_checklists", {
  id: serial("id").primaryKey(),
  /** Название чек-листа */
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  /** Привязка к этапу производства (null = общий) */
  stageId: integer("stage_id").references(() => productionStages.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("qc_checklists_stage_id").on(t.stageId),
]);

export const qcChecklistItems = pgTable("qc_checklist_items", {
  id: serial("id").primaryKey(),
  checklistId: integer("checklist_id").notNull().references(() => qcChecklists.id, { onDelete: "cascade" }),
  /** Текст пункта проверки */
  text: varchar("text", { length: 500 }).notNull(),
  /** Подробное описание / критерии */
  description: text("description"),
  /** Критический пункт (блокирует выпуск) */
  isCritical: boolean("is_critical").default(false),
  sortOrder: integer("sort_order").default(0),
}, (t) => [
  index("qc_checklist_items_checklist_id").on(t.checklistId),
]);

export const qcInspections = pgTable("qc_inspections", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  /** На каком этапе проведена проверка */
  productionStageId: integer("production_stage_id").references(() => productionOrderStages.id, { onDelete: "set null" }),
  /** По какому чек-листу */
  checklistId: integer("checklist_id").references(() => qcChecklists.id, { onDelete: "set null" }),
  /** Кто проверял */
  inspectorId: integer("inspector_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  result: qcInspectionsResultEnum("result").default("passed").notNull(),
  /** Общее заключение */
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("qc_inspections_production_stage_id").on(t.productionStageId),
  index("qc_inspections_checklist_id").on(t.checklistId),
  index("qc_inspections_inspector_id").on(t.inspectorId),
  index("qc_inspections_idx_production_order").on(t.productionOrderId),
  index("qc_inspections_idx_result").on(t.result),
]);

export const qcDefects = pgTable("qc_defects", {
  id: serial("id").primaryKey(),
  /** Связь с инспекцией */
  inspectionId: integer("inspection_id").references(() => qcInspections.id, { onDelete: "set null" }),
  productionOrderId: integer("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  severity: qcDefectsSeverityEnum("severity").default("major").notNull(),
  /** Краткое описание дефекта */
  title: varchar("title", { length: 255 }).notNull(),
  /** Подробное описание */
  description: text("description"),
  /** Фотоотчёт */
  photoPath: varchar("photo_path", { length: 255 }),
  status: qcDefectsStatusEnum("status").default("open").notNull(),
  reportedBy: integer("reported_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  fixedBy: integer("fixed_by").references(() => users.id, { onDelete: "set null" }),
  fixedAt: timestamp("fixed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("qc_defects_inspection_id").on(t.inspectionId),
  index("qc_defects_reported_by").on(t.reportedBy),
  index("qc_defects_fixed_by").on(t.fixedBy),
  index("qc_defects_idx_production_order").on(t.productionOrderId),
  index("qc_defects_idx_status").on(t.status),
  index("qc_defects_idx_severity").on(t.severity),
]);

export const qcInspectionResults = pgTable("qc_inspection_results", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull().references(() => qcInspections.id, { onDelete: "cascade" }),
  checklistItemId: integer("checklist_item_id").notNull().references(() => qcChecklistItems.id, { onDelete: "cascade" }),
  /** Результат пункта */
  status: qcInspectionResultsStatusEnum("status").default("ok").notNull(),
  /** Комментарий к пункту */
  comment: text("comment"),
}, (t) => [
  index("qc_inspection_results_inspection_id").on(t.inspectionId),
  index("qc_inspection_results_checklist_item_id").on(t.checklistItemId),
]);

export const rateLimits = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  /** IP или user_id */
  identifier: varchar("identifier", { length: 100 }).notNull(),
  /** login, register, api, message и т.д. */
  action: varchar("action", { length: 50 }).notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("rate_limits_idx_lookup").on(t.identifier, t.action, t.attemptedAt),
  index("rate_limits_idx_cleanup").on(t.attemptedAt),
]);

/**
 * Разовые коды привязки телеграма. Храним только sha256-отпечаток кода
 * (как ссылки на сброс пароля): утечка базы не выдаёт живых кодов.
 * Код одноразовый - при использовании строка удаляется. Уборка: строки с
 * expires_at < now() (при выдаче нового кода чистятся сразу, остальное -
 * планировщик).
 */
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("telegram_link_codes_code_hash").on(t.codeHash),
  index("telegram_link_codes_user_id").on(t.userId),
  index("telegram_link_codes_expires_at").on(t.expiresAt),
]);

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  rating: smallint("rating").notNull(),
  message: text("message").notNull(),
  status: reviewsStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  productId: integer("product_id"),
  comment: text("comment"),
}, (t) => [
  index("reviews_user_id").on(t.userId),
  index("reviews_idx_product_id").on(t.productId),
]);

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  /** Роль: admin, manager, user */
  role: varchar("role", { length: 30 }).notNull(),
  /** Модуль: orders, products, materials, documents, users, crm, counterparties, finance, calculator, messaging, tasks, kanban, pricelist */
  module: varchar("module", { length: 50 }).notNull(),
  /** Действие: view, create, edit, delete, manage */
  action: varchar("action", { length: 30 }).default("view").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("role_permissions_uk_role_module_action").on(t.role, t.module, t.action),
  index("role_permissions_idx_role").on(t.role),
]);

export const seoSettings = pgTable("seo_settings", {
  id: serial("id").primaryKey(),
  page: varchar("page", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  keywords: text("keywords"),
  ogTitle: varchar("og_title", { length: 255 }),
  ogDescription: text("og_description"),
  ogImage: varchar("og_image", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("seo_settings_page").on(t.page),
]);

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("settings_name").on(t.name),
]);

export const stockAlerts = pgTable("stock_alerts", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  alertType: stockAlertsAlertTypeEnum("alert_type").notNull(),
  message: text("message").notNull(),
  isResolved: boolean("is_resolved").default(false),
  /** Когда уведомление отправлено */
  notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "date" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("stock_alerts_idx_material").on(t.materialId),
  index("stock_alerts_idx_resolved").on(t.isResolved),
]);

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: varchar("ticket_number", { length: 30 }).notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 255 }).notNull(),
  category: supportTicketsCategoryEnum("category").default("general"),
  priority: supportTicketsPriorityEnum("priority").default("normal"),
  status: supportTicketsStatusEnum("status").default("open"),
  assignedTo: integer("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
}, (t) => [
  unique("support_tickets_ticket_number").on(t.ticketNumber),
  index("support_tickets_idx_user").on(t.userId),
  index("support_tickets_idx_status").on(t.status),
  index("support_tickets_idx_assigned").on(t.assignedTo),
  index("support_tickets_order_id").on(t.orderId),
]);

export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  // no action: см. chat_messages.user_id
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("support_ticket_messages_idx_ticket").on(t.ticketId),
  index("support_ticket_messages_user_id").on(t.userId),
]);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  taskItems: jsonb("task_items"),
  assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: tasksStatusEnum("status").default("pending"),
  priority: tasksPriorityEnum("priority").default("medium"),
  dueDate: timestamp("due_date", { mode: "date" }),
  /** Для какого `due_date` исполнителю уже сообщили о сроке (см. crm_reminders.notified_remind_at). */
  notifiedDueDate: timestamp("notified_due_date", { mode: "date" }),
  relatedOrderAccountingId: integer("related_order_accounting_id").references(() => ordersAccounting.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  index("tasks_assigned_to").on(t.assignedTo),
  index("tasks_created_by").on(t.createdBy),
  index("tasks_status").on(t.status),
  index("tasks_priority").on(t.priority),
  index("tasks_fk_tasks_order_accounting").on(t.relatedOrderAccountingId),
]);

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  // no action: см. chat_messages.user_id
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("task_comments_task_id").on(t.taskId),
  index("task_comments_user_id").on(t.userId),
]);

export const tochkaInvoices = pgTable("tochka_invoices", {
  id: serial("id").primaryKey(),
  /** ID документа в Точке */
  documentId: varchar("document_id", { length: 100 }).notNull(),
  /** Связанный заказ */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }),
  clientInn: varchar("client_inn", { length: 12 }),
  clientKpp: varchar("client_kpp", { length: 9 }),
  clientEmail: varchar("client_email", { length: 255 }),
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  paymentStatus: tochkaInvoicesPaymentStatusEnum("payment_status").default("waiting"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  paidAt: timestamp("paid_at", { mode: "date" }),
}, (t) => [
  unique("tochka_invoices_idx_document_id").on(t.documentId),
  index("tochka_invoices_idx_order").on(t.orderId),
  index("tochka_invoices_idx_status").on(t.paymentStatus),
  index("tochka_invoices_idx_created").on(t.createdAt),
]);

export const tochkaClosingDocuments = pgTable("tochka_closing_documents", {
  id: serial("id").primaryKey(),
  /** ID документа в Точке */
  documentId: varchar("document_id", { length: 100 }).notNull(),
  /** Тип: акт, счёт-фактура, накладная */
  documentType: tochkaClosingDocumentsDocumentTypeEnum("document_type").notNull(),
  /** Связанный счёт */
  linkedInvoiceId: integer("linked_invoice_id").references(() => tochkaInvoices.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }),
  clientInn: varchar("client_inn", { length: 12 }),
  amount: numeric("amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (t) => [
  unique("tochka_closing_documents_idx_document_id").on(t.documentId),
  index("tochka_closing_documents_idx_type").on(t.documentType),
  index("tochka_closing_documents_idx_order").on(t.orderId),
  index("tochka_closing_documents_linked_invoice_id").on(t.linkedInvoiceId),
]);

export const tochkaTokens = pgTable("tochka_tokens", {
  id: serial("id").primaryKey(),
  accessToken: varchar("access_token", { length: 255 }).notNull(),
  refreshToken: varchar("refresh_token", { length: 255 }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  /** Код компании в Точке */
  customerCode: varchar("customer_code", { length: 50 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (t) => [
  index("tochka_tokens_idx_expires").on(t.expiresAt),
]);

export const userTags = pgTable("user_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).default("#000000"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const userTagMappings = pgTable("user_tag_mappings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => userTags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  unique("user_tag_mappings_unique_user_tag").on(t.userId, t.tagId),
  index("user_tag_mappings_user_id").on(t.userId),
  index("user_tag_mappings_tag_id").on(t.tagId),
]);
