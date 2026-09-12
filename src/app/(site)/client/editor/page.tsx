import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { CardEditor } from "./CardEditor";

export const metadata: Metadata = {
  title: "Редактор открыток",
  robots: { index: false, follow: false },
};

/**
 * Редактор поздравительных открыток.
 *
 * Отдельная функция для федерации кикбоксинга: собрать картинку для
 * поста ко дню рождения, не дожидаясь дизайнера. Включается флагом
 * can_use_editor у конкретного клиента - остальным раздела нет.
 */
export default async function CardEditorPage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/editor");
  if (!user.canUseEditor) notFound();

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Редактор открыток"
        lead="Подставьте фотографию и имя - получится готовая картинка для поздравления. Собирается прямо в браузере, файл никуда не отправляется."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/editor", label: "Открытки" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <CardEditor />
        </Container>
      </section>
    </>
  );
}
