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

  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-bone/85 backdrop-blur-md">
      <Container className="flex h-18 items-center justify-between gap-6 py-3">
        <Link
          href="/"
          aria-label="БЗК Принт - на главную"
          className="text-ink transition-colors hover:text-brand"
        >
          <Logo className="h-9 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-pill px-4 py-2 text-[0.94rem] font-medium transition-colors",
                pathname === item.href
                  ? "bg-ink text-bone"
                  : "text-ink/70 hover:bg-ink/5 hover:text-brand",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {/* Телефон - в шапке, а не только в подвале: с телефона до
              подвала листать долго, а позвонить хотят с первого экрана.
              Номер целиком - только на широком экране: при узком шапка
              с меню и кнопками сотрудника не вмещает его в одну строку */}
          <a
            href={site.phoneHref}
            className="mr-1 hidden items-center gap-2 rounded-pill px-3 py-2 font-mono text-sm text-ink/80 transition-colors hover:bg-ink/5 hover:text-brand 2xl:flex"
          >
            <Phone className="size-4" aria-hidden />
            {site.phone}
          </a>
          <a
            href={site.phoneHref}
            aria-label={`Позвонить: ${site.phone}`}
            title={site.phone}
            className="rounded-pill p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-brand 2xl:hidden"
          >
            <Phone className="size-5" />
          </a>
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
              className="hidden items-center gap-2 rounded-pill bg-ink px-3.5 py-2 text-sm font-medium text-bone transition-colors hover:bg-brand sm:flex"
            >
              <LayoutDashboard className="size-4 shrink-0" aria-hidden />
              Админка
            </Link>
          )}

          {user ? (
            <>
              <Link
                href="/client/dashboard"
                className="hidden max-w-[11rem] items-center gap-2 truncate rounded-pill px-3 py-2 text-sm font-medium text-ink/75 transition-colors hover:bg-ink/5 hover:text-brand sm:flex"
              >
                <User className="size-4 shrink-0" aria-hidden />
                {user.name}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  aria-label="Выйти"
                  title="Выйти"
                  className="rounded-pill p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-danger"
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
            className="ml-1 rounded-pill p-2.5 text-ink hover:bg-ink/5 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>

      {open && (
        <nav className="border-t border-ink/10 bg-bone lg:hidden">
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
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative rounded-pill p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-brand"
    >
      {children}
    </Link>
  );
}
