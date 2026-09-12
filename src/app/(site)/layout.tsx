import { currentUser } from "@/auth";
import { cartCount } from "@/lib/cart";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  // Сессию читает серверный layout и передаёт вниз: иначе шапке
  // понадобился бы клиентский SessionProvider и лишний запрос из браузера.
  const [user, cartItems] = await Promise.all([currentUser(), cartCount()]);

  return (
    <>
      <SiteHeader user={user} cartCount={cartItems} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
