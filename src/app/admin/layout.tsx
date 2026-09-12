import { redirect } from "next/navigation";
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
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
