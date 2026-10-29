"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ShoppingBag, Heart, User, LogOut, LayoutDashboard, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/brand/Logo";
import { logout } from "@/app/actions/session";
import { site } from "@/lib/site";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/catalog", label: "Каталог" },
  { href: "/requirements", label: "Требования" },
  { href: "/payment-delivery", label: "Оплата и доставка" },
  { href: "/about", label: "О нас" },
  { href: "/contacts", label: "Контакты" },
];

type HeaderUser = { name: string; role: string } | null;

export function SiteHeader({
  user,
  cartCount = 0,
}: {
  user: HeaderUser;
  cartCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Сотруднику нужна дверь в админку с любой страницы витрины: заходить
  // туда по памяти набранным адресом неудобно. Менеджеру она нужна не
  // меньше администратора - без неё он до своих заказов не доберётся
  const isStaff = user?.role === "admin" || user?.role === "manager";

  // Где десктопный ряд перестаёт помещаться. Контейнер шапки упирается в
  // 76rem (1152px чистой ширины), поэтому дальше 1280px места не прибавляется:
  // - гость и клиент: логотип + меню + 4-5 иконок ~ 850-900px, помещаются с lg (1024);
  // - сотрудник: те же иконки плюс «Админка» с подписью ~ 1050px, в 960px
  //   чистой ширины на lg не влезает, поэтому бургер у него до xl (1280).
  // Классы написаны целиком: Tailwind собирает только литеральные строки
  const navShow = isStaff ? "hidden xl:flex" : "hidden lg:flex";
  const burgerHide = isStaff ? "xl:hidden" : "lg:hidden";

  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-bone/85 backdrop-blur-md">
      <Container className="flex h-18 flex-nowrap items-center justify-between gap-4 py-3 xl:gap-6">
        <Link
          href="/"
          aria-label="БЗК Принт - на главную"
          className="shrink-0 text-ink transition-colors hover:text-brand"
        >
          <Logo className="h-9 w-auto" />
        </Link>

        <nav aria-label="Основное меню" className={cn("shrink-0 items-center gap-1", navShow)}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-pill px-3 py-2 text-[0.94rem] font-medium leading-6 transition-colors xl:px-4",
                pathname === item.href
                  ? "bg-ink text-bone"
                  : "text-ink/70 hover:bg-ink/5 hover:text-brand",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {/* Телефон - в шапке, а не только в подвале: с телефона до
              подвала листать долго, а позвонить хотят с первого экрана.
              Номер текстом - только гостю и клиенту на xl: у сотрудника
              ряд плотнее (кнопка «Админка»), ему остаётся иконка-ссылка */}
          {!isStaff && (
            <a
              href={site.phoneHref}
              className="mr-1 hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-3 py-2 font-mono text-sm text-ink/80 transition-colors hover:bg-ink/5 hover:text-brand xl:flex"
            >
              <Phone className="size-4" aria-hidden />
              {site.phone}
            </a>
          )}
          <IconLink
            href={site.phoneHref}
            label={`Позвонить: ${site.phone}`}
            external
            className={isStaff ? undefined : "xl:hidden"}
          >
            <Phone className="size-5" />
          </IconLink>
          <IconLink href="/favorites" label="Избранное">
            <Heart className="size-5" />
          </IconLink>
          <IconLink
            href="/cart"
            label={
              cartCount > 0 ? `Корзина, позиций: ${cartCount}` : "Корзина"
            }
          >
            <ShoppingBag className="size-5" />
            {cartCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 grid min-w-4.5 place-items-center rounded-pill bg-brand px-1 font-mono text-[0.62rem] leading-4.5 text-bone"
              >
                {cartCount}
              </span>
            )}
          </IconLink>

          {isStaff && (
            <Link
              href="/admin"
              aria-label="Админка"
              title="Админка"
              className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-ink p-2.5 text-sm font-medium leading-5 text-bone transition-colors hover:bg-brand sm:flex xl:px-4"
            >
              <LayoutDashboard className="size-5 shrink-0" aria-hidden />
              <span className="hidden xl:inline">Админка</span>
            </Link>
          )}

          {user ? (
            <>
              {/* Имя - в подсказке и aria-label, а не текстом: имя
                  произвольной длины ломало ряд */}
              <IconLink
                href="/client/dashboard"
                label={`Личный кабинет: ${user.name}`}
                title={user.name}
                className="hidden sm:flex"
              >
                <User className="size-5" />
              </IconLink>
              <form action={logout} className="flex">
                <button
                  type="submit"
                  aria-label="Выйти"
                  title="Выйти"
                  className="shrink-0 rounded-pill p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-danger"
                >
                  <LogOut className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <IconLink href="/login" label="Войти">
              <User className="size-5" />
            </IconLink>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={open}
            className={cn("ml-1 shrink-0 rounded-pill p-2.5 text-ink hover:bg-ink/5", burgerHide)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>

      {open && (
        <nav aria-label="Мобильное меню" className={cn("border-t border-ink/10 bg-bone", burgerHide)}>
          <Container className="flex flex-col py-2">
            <a
              href={site.phoneHref}
              className="flex items-center gap-2.5 rounded-xl px-3 py-3 font-mono text-ink hover:bg-ink/5 hover:text-brand"
            >
              <Phone className="size-4 text-brand" aria-hidden />
              {site.phone}
            </a>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 font-medium text-ink/80 hover:bg-ink/5 hover:text-brand"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={user ? "/client/dashboard" : "/login"}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 font-medium text-ink/80 hover:bg-ink/5 hover:text-brand"
            >
              {user ? "Личный кабинет" : "Войти"}
            </Link>
            {isStaff && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 font-medium text-ink/80 hover:bg-ink/5 hover:text-brand"
              >
                Админка
              </Link>
            )}
          </Container>
        </nav>
      )}
    </header>
  );
}

function IconLink({
  href,
  label,
  title,
  external = false,
  className,
  children,
}: {
  href: string;
  label: string;
  title?: string;
  /** tel: и подобные ссылки - обычный <a>, а не клиентский переход */
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "relative shrink-0 rounded-pill p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-brand",
    className,
  );
  if (external) {
    return (
      <a href={href} aria-label={label} title={title ?? label} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={label} title={title ?? label} className={classes}>
      {children}
    </Link>
  );
}
