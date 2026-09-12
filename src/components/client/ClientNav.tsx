"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  FolderUp,
  Boxes,
  LifeBuoy,
  UserCog,
  Wand2,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string; icon: React.ElementType };

const BASE: Item[] = [
  { href: "/client/dashboard", label: "Сводка", icon: LayoutDashboard },
  { href: "/client/orders", label: "Заказы", icon: ShoppingBag },
  { href: "/client/uploads", label: "Файлы", icon: FolderUp },
  { href: "/client/support", label: "Поддержка", icon: LifeBuoy },
  { href: "/client/settings", label: "Профиль", icon: UserCog },
];

/**
 * Полоса разделов кабинета. Не липкая: шапка сайта уже приклеена к
 * верху, и вторая липкая полоса под ней съедала бы экран на телефоне.
 *
 * Мини-склад и редактор открыток видны не всем: это отдельные услуги,
 * включаемые клиенту вручную. Пункт, которого нет в меню, всё равно
 * закрыт на странице - меню только не дразнит недоступным разделом.
 */
export function ClientNav({
  miniWarehouse,
  editor,
}: {
  miniWarehouse: boolean;
  editor: boolean;
}) {
  const pathname = usePathname();

  const items: Item[] = [...BASE];
  if (miniWarehouse) {
    items.splice(3, 0, { href: "/client/warehouse", label: "Мой склад", icon: Boxes });
  }
  if (editor) {
    items.push({ href: "/client/editor", label: "Открытки", icon: Wand2 });
  }

  return (
    <nav
      aria-label="Разделы кабинета"
      className="border-b border-ink/10 bg-bone"
    >
      <Container>
        <ul className="-mx-1 flex gap-1 overflow-x-auto py-2">
          {items.map((item) => {
            // Раздел с подстраницами подсвечивается и на них: /client/orders/17
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-pill px-4 py-2 text-sm transition-colors",
                    active
                      ? "bg-ink text-bone"
                      : "text-ink/60 hover:bg-ink/6 hover:text-ink",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
