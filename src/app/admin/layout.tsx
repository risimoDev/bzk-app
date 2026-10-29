import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { staffOnly, visibleModules } from "@/lib/permissions";
import { AdminNav } from "@/components/admin/AdminNav";

/**
 * Админка живёт вне группы (site): у неё своя навигация и своя плотность.
 * Витринная шапка с логотипом на пол-экрана здесь только мешала бы -
 * в админке смотрят на таблицы, а не на обложку.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await staffOnly();
  if (!user) redirect("/login?from=/admin");

  // Меню фильтруем здесь: иначе каждый пункт стоил бы своего запроса
  const modules = await visibleModules(user.role);

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <AdminNav
        user={{ name: user.name, role: user.role }}
        modules={[...modules]}
      />
      <main className="min-w-0 flex-1">
        {/* Администратору без второго фактора напоминаем на каждой
            странице, но не блокируем: жёсткое принуждение закрыло бы
            доступ тому, кто ещё не успел поставить приложение */}
        {user.role === "admin" && !user.totpEnabled && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/30 bg-warn/10 px-5 py-2.5 text-sm text-ink"
          >
            <ShieldAlert className="size-4 shrink-0 text-warn" aria-hidden />
            <span className="font-medium">Включите двухфакторную защиту.</span>
            <span className="text-ink/60">
              У администратора доступ к деньгам и данным клиентов - одного пароля мало.
            </span>
            <Link
              href="/client/settings#two-factor"
              className="text-brand underline underline-offset-2 hover:text-brand-bright"
            >
              Настроить
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
