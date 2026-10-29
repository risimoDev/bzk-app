import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/auth";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/site/PageHero";
import { readCart, resolveCart } from "@/lib/cart";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Оформление заказа",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

/**
 * Оформление заказа.
 *
 * Только для вошедших: колонка `orders.user_id` обязательная, да и
 * смотреть заказ клиенту было бы негде. Контакты подставляем из профиля -
 * заполнять их заново тому, кто уже зарегистрирован, незачем.
 */
export default async function CheckoutPage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/checkout");

  const items = await resolveCart(await readCart());
  // Ключ этого открытия формы: повтор отправки (двойной щелчок, обновление
  // ответа) придёт с тем же ключом, и второго заказа не будет
  const checkoutToken = randomUUID();
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);

  const [profile] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      shippingAddress: users.shippingAddress,
    })
    .from(users)
    .where(eq(users.id, Number(user.id)))
    .limit(1);

  return (
    <>
      <PageHero
        eyebrow="Заказ"
        title="Оформление"
        lead="Проверьте состав и контакты. После оформления заказ появится в кабинете, а менеджер подтвердит сроки."
        breadcrumb={[
          { href: "/cart", label: "Корзина" },
          { href: "/checkout", label: "Оформление" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          {items.length === 0 ? (
            <div className="mx-auto max-w-lg rounded-card border border-ink/10 bg-bone/85 p-12 text-center">
              <h2 className="font-display text-2xl text-ink">Корзина пуста</h2>
              <p className="mt-3 text-ink/60">
                Оформлять пока нечего - выберите позиции в каталоге.
              </p>
              <div className="mt-7">
                <ButtonLink href="/catalog" size="md">
                  В каталог
                </ButtonLink>
              </div>
            </div>
          ) : (
            <>
              <ul className="mb-6 flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-card border border-ink/10 bg-bone/85 px-5 py-3"
                  >
                    <span className="text-ink">
                      {item.name}
                      {item.options.length > 0 && (
                        <span className="block text-sm text-ink/50">
                          {item.options
                            .map((o) => `${o.attribute}: ${o.value}`)
                            .join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm text-ink/55">
                      {item.quantity} {item.unit} × {money.format(item.unitPrice)}
                    </span>
                    <span className="font-mono tabular-nums text-ink">
                      {money.format(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <CheckoutForm
                subtotal={subtotal}
                checkoutToken={checkoutToken}
                defaults={{
                  name: profile?.name ?? user.name ?? "",
                  email: profile?.email ?? "",
                  phone: profile?.phone ?? "",
                  address: profile?.shippingAddress ?? "",
                }}
              />
            </>
          )}
        </Container>
      </section>
    </>
  );
}
