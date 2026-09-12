import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { Decor, clip } from "@/components/ui/Collage";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Восстановление пароля",
  description: "Восстановление доступа к личному кабинету БЗК Принт.",
  // Страницу восстановления в поиске показывать незачем
  robots: { index: false, follow: true },
};

export default async function ForgotPasswordPage() {
  // Вошедшему восстанавливать нечего - пароль меняется в профиле
  if (await currentUser()) redirect("/client/settings");

  return (
    <>
      <PageHero
        eyebrow="Личный кабинет"
        title="Забыли пароль"
        lead="Пришлём ссылку для смены пароля - в телеграм, если он привязан, иначе на почту."
        breadcrumb={[
          { href: "/login", label: "Вход" },
          { href: "/forgot-password", label: "Восстановление" },
        ]}
      />

      <section className="relative overflow-hidden torn-3 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="relative mx-auto max-w-md">
            <Decor
              asset={clip.mint}
              className="absolute -top-9 right-6 z-10 hidden w-10 rotate-[14deg] drop-shadow-md sm:block"
            />
            <div className="rounded-card border border-ink/10 bg-bone p-7 shadow-lift sm:p-9">
              <ForgotPasswordForm />
            </div>

            <p className="mt-6 text-center text-sm text-ink/55">
              Вспомнили пароль?{" "}
              <Link href="/login" className="text-brand hover:text-brand-bright">
                Войти
              </Link>
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
