import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { readCompany } from "@/lib/company-db";
import { loadContractorTask } from "@/lib/contractor-task-db";
import { PrintBar } from "@/components/print/PrintBar";
import { docStyles } from "@/components/print/doc-styles";
import { MarkSentButton } from "@/app/admin/external-orders/[id]/ContractorControls";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Задание подрядчику",
  robots: { index: false, follow: false },
};

const longDateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Задание подрядчику.
 *
 * Лист уходит на сторону, поэтому в нём только то, что нужно для работы:
 * наш номер задания, наши контакты, позиции подрядчика с описанием,
 * количеством и сроком. Заказчика (имя, телефон, почта, адрес,
 * комментарии) и денег (цены, суммы, себестоимость) здесь нет и быть не
 * должно: лист не получает их даже из запроса - см. loadContractorTask,
 * а правило закреплено в `npm run check:contractor-task`.
 *
 * Срок сдачи - отдельное поле позиции, а не срок готовности заказа: тот
 * обещан клиенту, а работа нужна нам раньше - на приёмку и отгрузку.
 * Не назначен - «по согласованию».
 *
 * Доступ только сотруднику с правом на заказы. Веб-ссылки для подрядчика
 * нет: лист распечатывают или сохраняют в PDF и отправляют сами.
 */
export default async function ContractorTaskPrintPage({
  params,
}: PageProps<"/print/contractor/[orderId]/[supplierId]">) {
  const { orderId: rawOrder, supplierId: rawSupplier } = await params;
  const orderId = parseId(rawOrder);
  const supplierId = parseId(rawSupplier);
  if (orderId === null || supplierId === null) notFound();

  if (!(await can("orders", "view"))) {
    redirect(`/login?from=${encodeURIComponent(`/admin/external-orders/${orderId}`)}`);
  }

  const task = await loadContractorTask(orderId, supplierId);
  if (!task) notFound();

  const [company, canEdit] = await Promise.all([readCompany(), can("orders", "edit")]);

  // Подрядчику нужно знать, кто ему пишет и как с нами связаться
  const noContact = !company.company_phone.trim() && !company.company_email.trim();
  const warnings = [
    !company.company_name.trim() ? "не указано наименование компании" : null,
    noContact ? "не указаны ни телефон, ни почта" : null,
  ].filter(Boolean);

  const today = new Date();

  return (
    <>
      <style>{docStyles}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>

      <PrintBar
        title={`Задание подрядчику ${task.number}`}
        backHref={`/admin/external-orders/${orderId}`}
        warning={warnings.length > 0 ? `В реквизитах компании ${warnings.join(", ")}.` : undefined}
        settingsHref="/admin/settings/company"
      />

      {canEdit && task.hasUnsent && (
        <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center gap-3 px-4 text-sm text-ink/70">
          Отправили подрядчику?
          <MarkSentButton orderId={orderId} supplierId={supplierId} />
        </div>
      )}

      <article className="doc doc--portrait">
        <h1 className="doc-title">
          Задание подрядчику № {task.number} от {longDateFmt.format(today)}
        </h1>

        <div style={{ marginTop: "4mm" }}>
          <div>
            <b>Заказчик работ:</b>{" "}
            {[
              company.company_name,
              company.company_inn && `ИНН ${company.company_inn}`,
              company.company_address,
            ]
              .filter(Boolean)
              .join(", ") || "-"}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Контакты:</b>{" "}
            {[company.company_phone, company.company_email].filter(Boolean).join(", ") || "-"}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Подрядчик:</b>{" "}
            {[task.supplier.name, task.supplier.contactPerson].filter(Boolean).join(", ")}
          </div>
        </div>

        <table className="doc-items">
          <thead>
            <tr>
              <th style={{ width: "6%" }}>№</th>
              <th style={{ width: "26%" }}>Наименование</th>
              <th>Описание, параметры</th>
              <th style={{ width: "9%" }}>Кол-во</th>
              <th style={{ width: "8%" }}>Ед.</th>
              <th style={{ width: "15%" }}>Срок сдачи</th>
            </tr>
          </thead>
          <tbody>
            {task.items.map((i, idx) => (
              <tr key={idx}>
                <td className="c">{idx + 1}</td>
                <td>{i.name}</td>
                <td style={{ whiteSpace: "pre-line" }}>{i.description || "-"}</td>
                <td className="c">{i.quantity}</td>
                <td className="c">{i.unit}</td>
                <td className="c">{i.dueDate ? dayFmt.format(i.dueDate) : "по согласованию"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: "4mm" }}>
          Всего позиций: {task.items.length}. Просим подтвердить получение задания и срок
          сдачи, при вопросах по макетам и параметрам обращаться по контактам выше.
        </p>

        <div className="doc-signatures" style={{ marginTop: "10mm" }}>
          <div className="doc-signature">
            <div className="doc-signature__role">Задание выдал</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot">{company.company_director}</span>
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
          </div>
          <div className="doc-signature">
            <div className="doc-signature__role">Задание принял</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot" />
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о., дата)</span>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
