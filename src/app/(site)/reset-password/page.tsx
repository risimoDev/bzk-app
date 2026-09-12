import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { Decor, clip } from "@/components/ui/Collage";
import { findByResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Новый пароль",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = String(sp.token ?? "");

  /**
   * Проверяем ссылку до показа формы: иначе человек придумает пароль,
   * нажмёт «сохранить» и только тогда узнает, что ссылка протухла.
   */
  const target = token ? await findByResetToken(token) : null;

  return (
    <>
      <PageHero
        eyebrow="Личный кабинет"
        title="Новый пароль"
        lead={
          target
            ? `Задайте новый пароль для ${target.email}.`
            : "Ссылка не подошла - запросите новую."
        }
        breadcrumb={[
          { href: "/login", label: "Вход" },
          { href: "/reset-password", label: "Новый пароль" },
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
              {target ? (
                <ResetPasswordForm token={token} />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-ink">
                    Ссылка недействительна или ей больше двух часов.
                  </p>
                  <p className="text-sm text-ink/55">
                    Такое бывает, если ссылкой уже воспользовались или запросили
                    новую - работает только последняя.
                  </p>
                  <Link
                    href="/forgot-password"
                    className="mt-1 self-start rounded-pill bg-brand px-5 py-2.5 font-display text-xs tracking-wider text-bone transition-colors hover:bg-brand-bright"
                  >
                    ЗАПРОСИТЬ НОВУЮ
                  </Link>
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
