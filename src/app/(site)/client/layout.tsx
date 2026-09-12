import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { ClientNav } from "@/components/client/ClientNav";

/**
 * Кабинет клиента.
 *
 * Разделы у всех разные: мини-склад и редактор открыток включаются
 * отдельным флагом у пользователя, поэтому меню собирается здесь, где
 * уже известно, кто вошёл.
 */
export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/dashboard");

  return (
    <>
      <ClientNav
        miniWarehouse={user.miniWarehouseEnabled}
        editor={user.canUseEditor}
      />
      {children}
    </>
  );
}
