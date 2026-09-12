import type { Metadata } from "next";
import { asc, eq, and, isNotNull, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { materials, pricingSettings, pricingEquipment } from "@/db/schema";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import { readSettings } from "@/lib/pricing";
import { CalculatorForm } from "./CalculatorForm";

export const metadata: Metadata = {
  title: "Калькулятор · Админка",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export default async function AdminCalculator() {
  if (!(await can("calculator", "view"))) {
    return (
      <AdminPage title="Калькулятор">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права считать стоимость." />
      </AdminPage>
    );
  }

  const [rows, settingsRows, equipment] = await Promise.all([
    // Считать можно только по материалам с заданными размерами листа:
    // без них раскрой не построить
    db
      .select({
        id: materials.id,
        name: materials.name,
        unit: materials.unit,
        costPerUnit: materials.costPerUnit,
        widthMm: materials.widthMm,
        heightMm: materials.heightMm,
      })
      .from(materials)
      .where(
        and(
          eq(materials.isActive, true),
          isNotNull(materials.widthMm),
          isNotNull(materials.heightMm),
          gt(sql`${materials.widthMm}`, sql`0`),
          gt(sql`${materials.heightMm}`, sql`0`),
        ),
      )
      .orderBy(asc(materials.name)),

    db.select().from(pricingSettings),
    db.select().from(pricingEquipment).where(eq(pricingEquipment.isActive, true)),
  ]);

  const list = rows.map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    costPerUnit: Number(m.costPerUnit ?? 0),
    widthMm: Number(m.widthMm ?? 0),
    heightMm: Number(m.heightMm ?? 0),
  }));

  const settings = readSettings(settingsRows);

  return (
    <AdminPage
      title="Калькулятор"
      subtitle="Раскрой листа и стоимость тиража"
    >
      {list.length === 0 && (
        <p className="mb-5 rounded-lg bg-navy/10 px-4 py-3 text-sm text-navy">
          Ни у одного материала не заданы размеры листа, поэтому список пуст -
          считайте по варианту «Свой материал». Как только заполните ширину и
          высоту в карточках материалов, они появятся в выборе.
        </p>
      )}

      <CalculatorForm materials={list} settings={settings} />

      {equipment.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg text-ink">Оборудование</h2>
          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-bone">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <th className="px-4 py-2.5 font-display text-[0.62rem] tracking-[0.16em] text-ink/40">
                    Название
                  </th>
                  <th className="px-4 py-2.5 text-right font-display text-[0.62rem] tracking-[0.16em] text-ink/40">
                    Ставка в час
                  </th>
                  <th className="px-4 py-2.5 text-right font-display text-[0.62rem] tracking-[0.16em] text-ink/40">
                    Скорость, м²/ч
                  </th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.id} className="border-b border-ink/6 last:border-0">
                    <td className="px-4 py-3 text-ink">{e.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {money.format(Number(e.hourlyRate))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-ink/70">
                      {e.speedSqmHour ? Number(e.speedSqmHour) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminPage>
  );
}
