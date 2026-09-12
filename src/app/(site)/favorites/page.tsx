import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { FavoritesList } from "./FavoritesList";

export const metadata: Metadata = {
  title: "Избранное",
  robots: { index: false, follow: false },
};

export default function FavoritesPage() {
  return (
    <>
      <PageHero
        eyebrow="Подборка"
        title="Избранное"
        lead="Список хранится в этом браузере - регистрация не нужна, но на другом устройстве он не появится."
        breadcrumb={[{ href: "/favorites", label: "Избранное" }]}
      />

      <section className="relative overflow-hidden torn-5 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <FavoritesList />
        </Container>
      </section>
    </>
  );
}
