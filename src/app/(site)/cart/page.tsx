import type { Metadata } from "next";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { readCart, resolveCart } from "@/lib/cart";
import { setQuantity, removeFromCart, clearCart, pruneCart } from "@/app/actions/cart";

export const metadata: Metadata = {
  title: "Корзина",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

export default async function CartPage() {
  const lines = await readCart();
  const items = await resolveCart(lines);
  // Строки, которые resolveCart выбросил: товар скрыли или поменяли его
  // характеристики. Молча терять их нельзя - человек не поймёт, куда
  // делась позиция
  const dropped = lines.length - items.length;
  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);

  return (
    <>
      <PageHero
        eyebrow="Заказ"
        title="Корзина"
        lead="Цены пересчитываются по тиражу: чем больше количество, тем ниже цена за единицу."
        breadcrumb={[{ href: "/cart", label: "Корзина" }]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          {dropped > 0 && (
            <div
              role="status"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warn/40 bg-warn/12 px-5 py-4 text-sm text-ink/80"
            >
              <p>
                Некоторые позиции убраны: товар скрыт или изменились его
                характеристики - добавьте их заново из каталога.
              </p>
              {/* Кука переписывается только действием: серверный компонент
                  страницы писать куки не может */}
              <form action={pruneCart}>
                <button
                  type="submit"
                  className="rounded-pill border border-ink/20 px-3.5 py-1.5 text-ink/75 transition-colors hover:border-brand hover:text-brand"
                >
                  Понятно
                </button>
              </form>
            </div>
          )}

          {items.length === 0 ? (
            <div className="mx-auto max-w-lg rounded-card border border-ink/10 bg-bone/85 p-12 text-center">
              <h2 className="font-display text-2xl text-ink">Корзина пуста</h2>
              <p className="mt-3 text-ink/60">
                Выберите позиции в каталоге - или опишите задачу, если нужного
                там нет.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/catalog" size="md">
                  В каталог
                </ButtonLink>
                <ButtonLink href="/contacts" size="md" variant="outline">
                  Описать задачу
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="rounded-card border border-ink/10 bg-bone/85 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          href={`/catalog/${item.productId}`}
                          className="font-display text-lg text-ink hover:text-brand"
                        >
                          {item.name}
                        </Link>

                        {item.options.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {item.options.map((o) => (
                              <li
                                key={`${o.attribute}-${o.value}`}
                                className="text-sm text-ink/55"
                              >
                                <span className="text-ink/40">
                                  {o.attribute}:{" "}
                                </span>
                                {o.value}
                                {o.modifier !== 0 && (
                                  <span className="ml-1 font-mono text-xs text-brand">
                                    {o.modifier > 0 ? "+" : "−"}
                                    {money.format(Math.abs(o.modifier))}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        <p className="mt-2 font-mono text-sm text-ink/55">
                          {money.format(item.unitPrice)} / {item.unit}
                        </p>
                      </div>

                      <form action={removeFromCart}>
                        <input type="hidden" name="key" value={item.key} />
                        <button
                          type="submit"
                          aria-label={`Убрать «${item.name}» из корзины`}
                          className="rounded-pill p-2 text-ink/40 transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </form>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                      {/* Кнопки - обычные формы: количество меняется и без JS */}
                      <div className="flex items-center gap-2">
                        <QtyButton
                          item={item}
                          delta={-item.multiplicity}
                          label="Уменьшить количество"
                        >
                          <Minus className="size-4" />
                        </QtyButton>

                        <span className="min-w-20 text-center font-mono text-lg text-ink tabular-nums">
                          {item.quantity}
                          <span className="ml-1 text-xs text-ink/45">
                            {item.unit}
                          </span>
                        </span>

                        <QtyButton
                          item={item}
                          delta={item.multiplicity}
                          label="Увеличить количество"
                        >
                          <Plus className="size-4" />
                        </QtyButton>
                      </div>

                      <span className="font-mono text-xl text-ink">
                        {money.format(item.lineTotal)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* ---------- Итог ---------- */}
              <aside className="rounded-card bg-ink p-7 text-bone shadow-lift grain lg:sticky lg:top-24">
                <h2 className="relative font-display text-sm tracking-[0.2em] text-ice/50">
                  Итого
                </h2>

                <dl className="relative mt-6 flex flex-col gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ice/60">Позиций</dt>
                    <dd className="font-mono text-ice/90">{items.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-ice/12 pt-4">
                    <dt className="text-ice/60">Сумма</dt>
                    <dd className="font-mono text-2xl text-brand-bright">
                      {money.format(total)}
                    </dd>
                  </div>
                </dl>

                <p className="relative mt-5 text-xs leading-relaxed text-ice/45">
                  Доставка считается отдельно - зависит от адреса и объёма.
                  Промокод и срочность применяются при оформлении.
                </p>

                <div className="relative mt-6 flex flex-col gap-3">
                  <ButtonLink href="/checkout" size="md" className="w-full">
                    Оформить заказ
                  </ButtonLink>
                  {/* На тёмной карточке обводка из варианта outline не
                      читается - ссылку стилизуем под соседнюю кнопку */}
                  <Link
                    href="/contacts"
                    className="w-full rounded-pill border border-ice/25 px-4 py-2 text-center text-sm text-ice/70 transition-colors hover:border-brand-bright hover:text-brand-bright"
                  >
                    Описать задачу менеджеру
                  </Link>
                  <form action={clearCart}>
                    <button
                      type="submit"
                      className="w-full rounded-pill border border-ice/25 px-4 py-2 text-sm text-ice/70 transition-colors hover:border-danger hover:text-danger"
                    >
                      Очистить корзину
                    </button>
                  </form>
                </div>
              </aside>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

function QtyButton({
  item,
  delta,
  label,
  children,
}: {
  item: { key: string; quantity: number; minQuantity: number; multiplicity: number };
  delta: number;
  label: string;
  children: React.ReactNode;
}) {
  const next = item.quantity + delta;
  const disabled = next < item.minQuantity;

  return (
    <form action={setQuantity}>
      <input type="hidden" name="key" value={item.key} />
      {/* Минимум и шаг сервер берёт из базы; здесь только желаемое число */}
      <input type="hidden" name="quantity" value={Math.max(next, item.minQuantity)} />
      <button
        type="submit"
        aria-label={label}
        disabled={disabled}
        className="grid size-9 place-items-center rounded-pill border border-ink/15 text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-35 disabled:hover:border-ink/15 disabled:hover:text-ink"
      >
        {children}
      </button>
    </form>
  );
}
