import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { Decor, clip } from "@/components/ui/Collage";

export const metadata: Metadata = {
  title: "Вход",
  description: "Вход в личный кабинет БЗК Принт.",
};

export default async function LoginPage() {
  if (await currentUser()) redirect("/client/dashboard");

  const { LoginForm } = await import("./LoginForm");

  return (
    <>
      <PageHero
        eyebrow="Личный кабинет"
        title="Вход"
        lead="Заказы, макеты и статус производства - в одном месте."
        breadcrumb={[{ href: "/login", label: "Вход" }]}
      />

      <section className="relative overflow-hidden torn-3 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="relative mx-auto max-w-md">
            <Decor
              asset={clip.mint}
              className="absolute -top-9 right-6 z-10 hidden w-10 rotate-[14deg] drop-shadow-md sm:block"
            />
            <div className="rounded-card border border-ink/10 bg-bone p-7 shadow-lift sm:p-9">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
