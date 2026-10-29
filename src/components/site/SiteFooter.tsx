import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Decor, scribble } from "@/components/ui/Collage";
import { site } from "@/lib/site";
import { currentUser } from "@/auth";
import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
  { href: "/about", label: "О компании" },
  { href: "/contacts", label: "Контакты" },
  { href: "/faq", label: "FAQ" },
];

const ACCOUNT_TAIL = [
  { href: "/cart", label: "Корзина" },
  { href: "/favorites", label: "Избранное" },
];

export async function SiteFooter() {
  // Вошедшему «Войти» ни к чему - вместо неё ссылка в кабинет
  const user = await currentUser();
  const account = user
    ? [{ href: "/client/dashboard", label: "Кабинет" }, ...ACCOUNT_TAIL]
    : [
        { href: "/client/dashboard", label: "Профиль" },
        ...ACCOUNT_TAIL,
        { href: "/login", label: "Войти" },
      ];

  return (
    <footer className="relative mt-auto overflow-hidden bg-ink text-ice grain">
      <Decor
        asset={scribble.zigzagWhite}
        className="absolute -right-16 -top-10 w-80 opacity-25 mix-blend-screen"
      />

      <Container className="relative py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo className="h-12 w-auto text-bone" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ice/65">
              Рекламно-производственное агентство в Перми. Печать, сувенирная
              продукция и наружная реклама - от макета до готового тиража.
            </p>
            <div className="mt-6 flex gap-3">
              {site.social.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-pill border border-ice/20 px-4 py-1.5 text-sm text-ice/80 transition-colors hover:border-brand-bright hover:text-brand-bright"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Навигация" links={NAV} />
          <FooterColumn title="Кабинет" links={account} />

          <div>
            <h3 className="font-display text-sm tracking-[0.18em] text-ice/50">
              Контакты
            </h3>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <a
                  href={site.phoneHref}
                  className="font-mono text-lg text-bone hover:text-brand-bright"
                >
                  {site.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="text-ice/80 hover:text-brand-bright"
                >
                  {site.email}
                </a>
              </li>
              <li>
                <a
                  href={site.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ice/80 hover:text-brand-bright"
                >
                  {site.address}
                </a>
              </li>
            </ul>

            <h3 className="mt-8 font-display text-sm tracking-[0.18em] text-ice/50">
              Часы работы
            </h3>
            <dl className="mt-4 space-y-1.5 text-sm">
              {site.hours.map((h) => (
                <div key={h.days} className="flex justify-between gap-4">
                  <dt className="text-ice/55">{h.days}</dt>
                  <dd className="font-mono text-ice/90">{h.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-ice/12 pt-6 text-xs text-ice/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName}. Все права защищены.
          </p>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-ice">
              Политика конфиденциальности
            </Link>
            <Link href="/terms" className="hover:text-ice">
              Условия использования
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="font-display text-sm tracking-[0.18em] text-ice/50">
        {title}
      </h3>
      <ul className="mt-5 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-ice/80 hover:text-brand-bright">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
