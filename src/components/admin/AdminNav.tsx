"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Package,
  Factory,
  Users,
  Wallet,
  ChartLine,
  Calculator,
  ListOrdered,
  Boxes,
  Truck,
  FileText,
  ListChecks,
  ClipboardCheck,
  Contact,
  FileSignature,
  Inbox,
  LifeBuoy,
  Ticket,
  Handshake,
  Landmark,
  Building2,
  Search,
  Store,
  Library,
  Bot,
  ExternalLink,
  LogOut,
  Menu,
  X,
  History,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { logout } from "@/app/actions/session";
import { cn } from "@/lib/cn";

/**
 * Разделы меню и модуль прав, которым каждый закрыт.
 *
 * Модуль тот же, что проверяет сама страница: если у роли нет права
 * смотреть раздел, пункт не показываем - иначе меню ведёт на страницы
 * с надписью «нет доступа». Сводка без модуля: в неё пускает staffOnly.
 */
const SECTIONS = [
  {
    title: null,
    items: [{ href: "/admin", label: "Сводка", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Работа",
    items: [
      { href: "/admin/orders", label: "Заказы с сайта", icon: ShoppingCart, module: "orders" },
      { href: "/admin/external-orders", label: "Заказы менеджера", icon: ClipboardList, module: "orders" },
      { href: "/admin/products", label: "Товары", icon: Package, module: "products" },
      { href: "/admin/clients", label: "Клиенты", icon: Users, module: "users" },
      { href: "/admin/counterparties", label: "Контрагенты", icon: Contact, module: "users" },
      { href: "/admin/production", label: "Производство", icon: Factory, module: "kanban" },
      { href: "/admin/quality", label: "Качество", icon: ClipboardCheck, module: "orders" },
      { href: "/admin/tasks", label: "Задачи", icon: ListChecks, module: "tasks" },
      { href: "/admin/materials", label: "Склад", icon: Boxes, module: "materials" },
      { href: "/admin/purchases", label: "Закупки", icon: Truck, module: "materials" },
      { href: "/admin/suppliers", label: "Подрядчики", icon: Store, module: "materials" },
      { href: "/admin/finance", label: "Бухгалтерия", icon: Wallet, module: "finance" },
      { href: "/admin/analytics", label: "Аналитика", icon: ChartLine, module: "finance" },
      { href: "/admin/calculator", label: "Калькулятор", icon: Calculator, module: "calculator" },
      { href: "/admin/pricelist", label: "Прайс-лист", icon: ListOrdered, module: "pricelist" },
      { href: "/admin/offers", label: "Предложения", icon: FileText, module: "documents" },
    ],
  },
  {
    title: "Клиенты и документы",
    items: [
      { href: "/admin/crm", label: "CRM", icon: Handshake, module: "users" },
      { href: "/admin/support", label: "Поддержка", icon: LifeBuoy, module: "messaging" },
      { href: "/admin/inbox", label: "Сообщения с сайта", icon: Inbox, module: "messaging" },
      { href: "/admin/promocodes", label: "Промокоды", icon: Ticket, module: "settings" },
      { href: "/admin/documents", label: "Документы", icon: FileSignature, module: "documents" },
      { href: "/admin/tochka", label: "Точка Банк", icon: Landmark, module: "finance" },
      { href: "/admin/settings/company", label: "Реквизиты", icon: Building2, module: "settings" },
      { href: "/admin/settings/catalogs", label: "Справочники", icon: Library, module: "settings" },
      { href: "/admin/seo", label: "SEO", icon: Search, module: "settings" },
      { href: "/admin/telegram", label: "Телеграм", icon: Bot, module: "settings" },
      { href: "/admin/audit", label: "Журнал действий", icon: History, module: "settings" },
    ],
  },
];

export function AdminNav({
  user,
  modules,
}: {
  user: { name: string; role: string };
  /** Разделы, на которые у роли есть право «смотреть». */
  modules: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allowed = new Set(modules);

  return (
    <>
      {/* Полоса управления на узких экранах */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-ink/10 bg-graphite px-4 text-bone lg:hidden">
        <Logo className="h-6 w-auto" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          className="rounded-lg p-2 hover:bg-bone/10"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <aside
        className={cn(
          "z-40 flex w-60 shrink-0 flex-col bg-graphite text-ice",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:pt-14",
          !open && "max-lg:hidden",
          "lg:sticky lg:top-0 lg:h-screen",
        )}
      >
        <div className="hidden items-center gap-3 px-5 py-5 lg:flex">
          <Logo className="h-7 w-auto text-bone" />
          <span className="font-display text-xs tracking-[0.2em] text-ice/40">
            Админка
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {SECTIONS.map((section, i) => {
            const items = section.items.filter(
              (item) => !("module" in item) || allowed.has(item.module),
            );
            if (items.length === 0) return null;

            return (
            <div key={section.title ?? i} className="mb-5">
              {section.title && (
                <p className="mb-1.5 px-3 font-display text-[0.62rem] tracking-[0.2em] text-ice/30">
                  {section.title}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active =
                    "exact" in item && item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-brand text-bone"
                            : "text-ice/70 hover:bg-bone/8 hover:text-bone",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </nav>

        <div className="border-t border-bone/10 p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm text-bone">{user.name}</p>
            <p className="font-mono text-[0.68rem] text-ice/40">
              {user.role === "admin" ? "администратор" : "менеджер"}
            </p>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ice/60 transition-colors hover:bg-bone/8 hover:text-bone"
          >
            <ExternalLink className="size-4" aria-hidden />
            На сайт
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ice/60 transition-colors hover:bg-danger/15 hover:text-danger"
            >
              <LogOut className="size-4" aria-hidden />
              Выйти
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
