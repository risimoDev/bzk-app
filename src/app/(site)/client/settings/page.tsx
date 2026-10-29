import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { isTelegramConfigured, getBotInfo } from "@/lib/telegram";
import { LINK_CODE_TTL_MINUTES } from "@/lib/telegram-link";
import { TelegramLink } from "@/components/client/TelegramLink";
import { isDadataEnabled } from "@/lib/dadata";
import { ProfileForm } from "./ProfileForm";
import { NotificationsForm } from "./NotificationsForm";
import { PasswordForm } from "./PasswordForm";
import { TwoFactorPanel } from "@/components/client/TwoFactorPanel";
import { SignOutEverywhere } from "@/components/client/SignOutEverywhere";

export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};

export default async function ClientSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/settings");

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, Number(user.id)))
    .limit(1);

  if (!row) notFound();

  // Имя бота нужно для ссылки «открыть бота»; если телеграм не настроен,
  // блок привязки просто не показываем
  const telegramReady = isTelegramConfigured();
  const bot = telegramReady ? await getBotInfo() : null;

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Профиль"
        lead="Контакты для связи, реквизиты для документов и то, о чём вам писать."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/settings", label: "Профиль" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <ProfileForm
              innLookup={isDadataEnabled()}
              profile={{
                name: row.name,
                email: row.email,
                phone: row.phone ?? "",
                // Колонка календарная и приходит строкой «ГГГГ-ММ-ДД» -
                // ровно то, что ждёт input type="date"
                birthday: row.birthday ?? "",
                shippingAddress: row.shippingAddress ?? "",
                isCorporate: row.isCorporate ?? false,
                companyName: row.companyName ?? "",
                inn: row.inn ?? "",
                kpp: row.kpp ?? "",
                legalAddress: row.legalAddress ?? "",
              }}
            />

            <NotificationsForm
              prefs={{
                email: row.emailNotifications ?? true,
                sms: row.smsNotifications ?? true,
                telegram: row.telegramNotifications ?? false,
                newsletter: row.newsletter ?? false,
              }}
              telegramLinked={Boolean(row.telegramChatId)}
            />

            {telegramReady && (
              <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
                <h2 className="font-display text-xl text-ink">Телеграм</h2>
                <div className="mt-4">
                  <TelegramLink
                    ttlMinutes={LINK_CODE_TTL_MINUTES}
                    botUrl={bot?.username ? `https://t.me/${bot.username}` : null}
                    linked={Boolean(row.telegramChatId)}
                  />
                </div>
              </div>
            )}

            <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
              <h2 className="font-display text-xl text-ink">Пароль</h2>
              <p className="mt-2 text-sm text-ink/55">
                Текущий пароль спрашиваем не зря: сессия живёт месяц, и без него
                с чужого незакрытого браузера аккаунт забрали бы целиком.
              </p>
              <div className="mt-5">
                <PasswordForm />
              </div>
            </div>

            {/* Второй фактор - только сотрудникам: за админкой деньги и
                данные клиентов, за кабинетом клиента - его собственные */}
            {user.role !== "user" && (
              <div
                id="two-factor"
                className="scroll-mt-24 rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7"
              >
                <h2 className="font-display text-xl text-ink">Двухфакторный вход</h2>
                <div className="mt-4">
                  <TwoFactorPanel
                    enabled={Boolean(row.totpEnabledAt)}
                    hasSecret={Boolean(row.totpSecret)}
                  />
                </div>
              </div>
            )}

            <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
              <h2 className="font-display text-xl text-ink">Сессии</h2>
              <p className="mt-2 text-sm text-ink/55">
                Потеряли телефон или входили с чужого компьютера - закройте все
                сессии разом. Войти придётся заново на каждом устройстве.
                {user.role !== "user" && " Сессия сотрудника в любом случае живёт не дольше недели."}
              </p>
              <div className="mt-5">
                <SignOutEverywhere />
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
