import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { Boxes } from "lucide-react";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { miniWarehouseItems } from "@/db/schema";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/site/PageHero";
import { warehouseStatus } from "@/lib/client-portal";
import { WarehouseForm } from "./WarehouseForm";
import { WarehouseRow } from "./WarehouseRow";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Мой склад",
  robots: { index: false, follow: false },
};

/**
 * Мини-склад клиента: что из его вещей лежит у нас.
 *
 * Раздел подключается отдельно - тем, кто оставляет у нас свои футболки,
 * бланки или заготовки. У остальных страницы просто нет.
 */
export default async function ClientWarehousePage() {
  const user = await currentUser();
  if (!user) redirect("/login?from=/client/warehouse");

  // Раздел не подключён - страницы для этого клиента не существует, а не
  // «нет доступа»: так меню и адрес говорят одно и то же
  if (!user.miniWarehouseEnabled) notFound();

  const items = await db
    .select()
    .from(miniWarehouseItems)
    .where(eq(miniWarehouseItems.userId, Number(user.id)))
    .orderBy(desc(miniWarehouseItems.updatedAt), desc(miniWarehouseItems.id));

  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <PageHero
        eyebrow="Кабинет"
        title="Мой склад"
        lead="Ваши материалы и заготовки, которые лежат у нас. Ведите список сами - статус проставляет менеджер, когда что-то уходит в работу или на отгрузку."
        breadcrumb={[
          { href: "/client/dashboard", label: "Кабинет" },
          { href: "/client/warehouse", label: "Мой склад" },
        ]}
      />

      <section className="relative overflow-hidden torn-2 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2.5 text-ink/60">
              <Boxes className="size-5 text-brand" aria-hidden />
              {items.length === 0
                ? "Список пуст"
                : `Позиций: ${items.length}, единиц хранения: ${totalUnits}`}
            </p>
            <WarehouseForm />
          </div>

          {items.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3">
              {items.map((item) => {
                const st = warehouseStatus(item.status);
                return (
                  <li
                    key={item.id}
                    className="rounded-card border border-ink/10 bg-bone/85 px-6 py-5"
                  >
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                      <div className="min-w-48 flex-1">
                        <p className="text-ink">{item.name}</p>
                        {item.description && (
                          <p className="mt-0.5 text-sm text-ink/55">{item.description}</p>
                        )}
                      </div>

                      <span className="font-mono text-lg tabular-nums text-ink">
                        {item.quantity}
                      </span>

                      <span
                        className={cn(
                          "rounded-pill px-3 py-1 font-display text-[0.68rem] tracking-[0.12em]",
                          st.className,
                        )}
                      >
                        {st.label}
                      </span>
                    </div>

                    <WarehouseRow
                      item={{
                        id: item.id,
                        name: item.name,
                        description: item.description ?? "",
                        quantity: item.quantity,
                      }}
                      // Ушедшее в работу и отгруженное правит менеджер:
                      // клиент не должен задним числом менять то, что уже
                      // посчитано в производстве
                      locked={item.status !== "in_stock"}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-8 max-w-2xl text-sm text-ink/50">
            Если позиции нет в списке, а вещь вы нам привозили - напишите в поддержку,
            сверим и добавим.
          </p>
        </Container>
      </section>
    </>
  );
}
