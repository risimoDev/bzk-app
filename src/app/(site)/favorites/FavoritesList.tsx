"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ButtonLink } from "@/components/ui/Button";
import { ProductImage } from "@/components/catalog/ProductImage";
import { FavoriteButton, useFavorites } from "@/components/catalog/FavoriteButton";
import { writeFavorites } from "@/lib/favorites";

type Item = {
  id: number;
  name: string;
  /** Цена за единицу при минимальном тираже; null - по запросу. */
  fromPrice: number | null;
  unit: string | null;
  categoryName: string | null;
  imageUrl: string | null;
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function FavoritesList() {
  const ids = useFavorites();
  const [fetched, setFetched] = useState<Item[] | null>(null);

  // Пустое избранное - не состояние, а следствие пустого списка id.
  // Выводим его напрямую, иначе пришлось бы звать setState прямо в эффекте
  // и получать лишний каскадный рендер.
  const items = ids.length === 0 ? [] : fetched;

  // Список id - во внешнем хранилище, а карточки к ним приходят с сервера.
  // Здесь эффект уместен: это загрузка данных, а не чтение состояния.
  useEffect(() => {
    if (ids.length === 0) return;

    const controller = new AbortController();

    fetch(`/api/products?ids=${ids.join(",")}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { items: Item[] }) => {
        // Порядок - как добавляли, а не как вернула база
        const byId = new Map(data.items.map((i) => [i.id, i]));
        setFetched(ids.map((id) => byId.get(id)).filter((i) => i !== undefined));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setFetched([]);
      });

    return () => controller.abort();
  }, [ids]);

  if (items === null) {
    return <p className="text-ink/50">Загружаем избранное…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-card border border-ink/10 bg-bone/85 p-12 text-center">
        <h2 className="font-display text-2xl text-ink">Здесь пока пусто</h2>
        <p className="mt-3 text-ink/60">
          Отмечайте сердечком то, к чему хотите вернуться. Список хранится в
          этом браузере.
        </p>
        <div className="mt-7">
          <ButtonLink href="/catalog" size="md">
            В каталог
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-ink/60">
          В избранном: <span className="font-mono text-ink">{items.length}</span>
        </p>
        <ConfirmButton
          title="Очистить избранное?"
          text="Список хранится только в этом браузере - вернуть его не получится."
          confirmLabel="Очистить"
          onConfirm={() => writeFavorites([])}
          className="flex items-center gap-2 rounded-pill border border-ink/15 px-4 py-2 text-sm text-ink/60 transition-colors hover:border-danger hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
          Очистить
        </ConfirmButton>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="relative">
            <FavoriteButton
              productId={item.id}
              className="absolute right-3 top-3 z-10"
            />
            <Link
              href={`/catalog/${item.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-ink/10 bg-bone/85 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-lift"
            >
              <div className="relative aspect-4/3 overflow-hidden bg-ice">
                <ProductImage
                  src={item.imageUrl}
                  alt={item.name}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                {item.categoryName && (
                  <span className="font-display text-[0.68rem] tracking-[0.16em] text-ink/40">
                    {item.categoryName}
                  </span>
                )}
                <h2 className="mt-1.5 font-display text-lg leading-tight text-ink group-hover:text-brand">
                  {item.name}
                </h2>
                <p className="mt-auto pt-4 font-mono text-lg text-ink">
                  {item.fromPrice !== null ? (
                    <>
                      <span className="text-sm text-ink/45">от </span>
                      {money.format(item.fromPrice)}
                      <span className="text-sm text-ink/45">
                        {" "}
                        / {item.unit ?? "шт."}
                      </span>
                    </>
                  ) : (
                    <span className="text-base text-ink/50">Цена по запросу</span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
