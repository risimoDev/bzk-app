import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { Decor, clip } from "@/components/ui/Collage";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Регистрация",
  description: "Создайте аккаунт, чтобы следить за заказами в личном кабинете.",
};

export default async function RegisterPage() {
  if (await currentUser()) redirect("/client/dashboard");

  return (
    <>
      <PageHero
        eyebrow="Личный кабинет"
        title="Регистрация"
        lead="Аккаунт нужен, чтобы видеть статус заказа и историю без звонков менеджеру."
        breadcrumb={[{ href: "/register", label: "Регистрация" }]}
      />

      <section className="relative overflow-hidden torn-4 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="relative mx-auto max-w-md">
            <Decor
              asset={clip.steel}
              className="absolute -top-8 left-8 z-10 hidden w-9 rotate-[10deg] drop-shadow-md sm:block"
            />
            <div className="rounded-card border border-ink/10 bg-bone p-7 shadow-lift sm:p-9">
              <RegisterForm />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
