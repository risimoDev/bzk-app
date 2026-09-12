import type { Metadata } from "next";
import { desc, isNotNull, sql, count } from "drizzle-orm";
import { CircleAlert, CircleCheck, Bot } from "lucide-react";
import { db } from "@/db";
import { users, notificationLog } from "@/db/schema";
import { AdminPage, AdminEmpty, AdminStat } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  isTelegramConfigured,
  hasGroupChat,
  hasWebhookSecret,
  getBotInfo,
  getWebhookInfo,
} from "@/lib/telegram";
import { absoluteUrl } from "@/lib/site";
import { WebhookControls, TestMessageButton, UnlinkButton } from "./TelegramControls";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Телеграм · Админка",
  robots: { index: false, follow: false },
};

const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const WEBHOOK_URL = absoluteUrl("/api/telegram/webhook");

export default async function AdminTelegram() {
  if (!(await can("settings", "view"))) {
    return (
      <AdminPage title="Телеграм">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть настройки." />
      </AdminPage>
    );
  }

  const configured = isTelegramConfigured();
  const canEdit = await can("settings", "edit");

  const [bot, webhook] = configured
    ? await Promise.all([getBotInfo(), getWebhookInfo()])
    : [null, null];

  const [linked, log, [stats]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        chatId: users.telegramChatId,
        enabled: users.telegramNotifications,
      })
      .from(users)
      .where(isNotNull(users.telegramChatId))
      .orderBy(users.role, users.name),
    db
      .select({
        id: notificationLog.id,
        eventCode: notificationLog.eventCode,
        title: notificationLog.title,
        status: notificationLog.status,
        error: notificationLog.errorMessage,
        createdAt: notificationLog.createdAt,
        userName: users.name,
      })
      .from(notificationLog)
      .leftJoin(users, sql`${users.id} = ${notificationLog.userId}`)
      .orderBy(desc(notificationLog.createdAt))
      .limit(20),
    db
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${notificationLog.status} = 'failed')`,
      })
      .from(notificationLog),
  ]);

  const registered = Boolean(webhook?.url);
  const rightUrl = webhook?.url === WEBHOOK_URL;
  const failed = Number(stats?.failed ?? 0);

  return (
    <AdminPage title="Телеграм" subtitle="Бот уведомлений и привязанные аккаунты">
      {/* ------------------------------------------------ состояние */}
      <div
        className={cn(
          "flex flex-wrap items-start gap-3 rounded-xl border px-5 py-4 text-sm",
          configured && registered && rightUrl
            ? "border-ok/25 bg-ok/8"
            : "border-warn/30 bg-warn/8",
        )}
      >
        {configured && registered && rightUrl ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        )}

        <div className="flex-1">
          {!configured ? (
            <>
              <p className="text-ink">Бот не настроен.</p>
              <p className="mt-1 text-ink/60">
                Задайте <code className="font-mono text-xs">TELEGRAM_BOT_TOKEN</code> -
                токен выдаёт @BotFather. Рядом стоит прописать{" "}
                <code className="font-mono text-xs">TELEGRAM_WEBHOOK_SECRET</code>: с ним
                чужой запрос на наш адрес отбрасывается.
              </p>
            </>
          ) : !registered ? (
            <>
              <p className="text-ink">
                Токен работает{bot?.username ? `, бот @${bot.username}` : ""}. Вебхук не
                зарегистрирован - бот не получает сообщения.
              </p>
              <p className="mt-1 font-mono text-xs text-ink/55">{WEBHOOK_URL}</p>
            </>
          ) : !rightUrl ? (
            <>
              <p className="text-ink">Вебхук зарегистрирован на другой адрес.</p>
              <p className="mt-1 font-mono text-xs text-ink/60">
                сейчас: {webhook?.url}
                <br />
                нужно: {WEBHOOK_URL}
              </p>
            </>
          ) : (
            <>
              <p className="text-ink">
                Подключено{bot?.username ? `: @${bot.username}` : ""}.
              </p>
              <p className="mt-1 text-ink/60">
                Необработанных обновлений: {webhook?.pending_update_count ?? 0}
                {hasGroupChat() ? " · рабочая группа задана" : " · рабочая группа не задана"}
                {hasWebhookSecret() ? " · секрет вебхука задан" : " · секрет вебхука не задан"}
              </p>
            </>
          )}

          {webhook?.last_error_message && (
            <p className="mt-2 rounded-lg bg-danger/8 px-3 py-2 text-xs text-danger">
              Последняя ошибка доставки: {webhook.last_error_message}
              {webhook.last_error_date &&
                ` (${dtTime.format(new Date(webhook.last_error_date * 1000))})`}
            </p>
          )}
        </div>
      </div>

      {configured && canEdit && (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-ink/10 bg-bone px-5 py-4">
          <WebhookControls registered={registered} />
          <TestMessageButton />
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Привязанных аккаунтов" value={String(linked.length)} />
        <AdminStat label="Уведомлений отправлено" value={String(Number(stats?.total ?? 0))} />
        <AdminStat
          label="Не доставлено"
          value={String(failed)}
          tone={failed > 0 ? "warn" : "plain"}
        />
      </div>

      {/* ------------------------------------------------- аккаунты */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2.5 font-display text-lg text-ink">
          <Bot className="size-5 text-brand" aria-hidden />
          Кому пишет бот
        </h2>

        {linked.length === 0 ? (
          <div className="mt-4">
            <AdminEmpty
              title="Никто не привязан"
              text="Аккаунт связывается разовым кодом из «Профиля» в кабинете - командой /connect КОД боту."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {linked.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-3 text-sm"
              >
                <span>
                  <span className="text-ink">{u.name}</span>
                  <span className="block text-xs text-ink/45">
                    {u.email} · {u.role === "user" ? "клиент" : u.role}
                    {u.enabled === false && " · уведомления выключены"}
                  </span>
                </span>
                {canEdit && <UnlinkButton userId={u.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------- журнал */}
      {log.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">Последние отправки</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {log.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-bone px-5 py-2.5 text-sm"
              >
                <span>
                  <span className="text-ink">{l.title}</span>
                  <span className="block text-xs text-ink/45">
                    {l.userName ?? "-"} · {l.eventCode}
                    {l.error && <span className="text-danger"> · {l.error}</span>}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {l.createdAt && (
                    <span className="font-mono text-xs text-ink/40">
                      {dtTime.format(l.createdAt)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                      l.status === "sent" ? "bg-ok/15 text-ok" : "bg-danger/12 text-danger",
                    )}
                  >
                    {l.status === "sent" ? "ДОСТАВЛЕНО" : "ОШИБКА"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 max-w-3xl text-xs text-ink/45">
        Аккаунт связывается разовым кодом из кабинета, а не по адресу почты, как
        в старом боте: там команда «/connect почта» привязывала чат к аккаунту по
        одному только адресу, и чужие уведомления получал любой, кто этот адрес
        знал.
      </p>
    </AdminPage>
  );
}
