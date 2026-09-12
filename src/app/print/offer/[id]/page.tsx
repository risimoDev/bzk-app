import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commercialOfferItems, commercialOffers } from "@/db/schema";
import { can } from "@/lib/permissions";
import { readCompany } from "@/lib/company-db";
import {
  missingFields,
  REQUIRED_FOR_DOCUMENTS,
  COMPANY_FIELDS,
} from "@/lib/company";
import { plural, rublesInWords } from "@/lib/num2words";
import { parseLocalDate } from "@/lib/dates";
import { PrintBar } from "@/components/print/PrintBar";
import { docStyles } from "@/components/print/doc-styles";

export const metadata: Metadata = {
  title: "Коммерческое предложение",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const longDateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Печатная форма коммерческого предложения.
 *
 * КП - не первичный документ, формы у него нет, поэтому лист собран по
 * тому же образцу, что счёт: реквизиты сторон, перечень, условия. Печать
 * идёт через диалог браузера - он же сохраняет в PDF, и кириллические
 * шрифты не приходится встраивать вручную, как это делал Dompdf.
 */
export default async function OfferPrintPage({ params }: PageProps<"/print/offer/[id]">) {
  if (!(await can("documents", "view"))) redirect("/login?from=/admin/offers");

  const { id } = await params;
  const offerId = Number(id);
  if (!Number.isInteger(offerId) || offerId <= 0) notFound();

  const [offer] = await db
    .select()
    .from(commercialOffers)
    .where(eq(commercialOffers.id, offerId))
    .limit(1);
  if (!offer) notFound();

  const items = await db
    .select()
    .from(commercialOfferItems)
    .where(eq(commercialOfferItems.offerId, offerId))
    .orderBy(asc(commercialOfferItems.sortOrder), asc(commercialOfferItems.id));

  const seller = await readCompany();
  const missing = missingFields(seller, REQUIRED_FOR_DOCUMENTS);

  // Итог считаем из позиций: в перенесённых КП поле total_amount осталось
  // нулевым - старый сайт его не пересчитывал
  const subtotal = items.reduce((s, i) => s + Number(i.total), 0);
  const discountPercent = Number(offer.discountPercent ?? 0);
  const discount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const total = Math.round((subtotal - discount) * 100) / 100;

  const created = offer.createdAt ?? new Date();
  const validUntil = parseLocalDate(offer.validUntil);
  const prepayment = Number(offer.prepaymentPercent ?? 0);

  return (
    <>
      <style>{docStyles}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>

      <PrintBar
        title={`КП ${offer.number}`}
        backHref="/admin/offers"
        warning={
          missing.length > 0
            ? `Не заполнены реквизиты: ${missing
                .map((f) => COMPANY_FIELDS[f].toLowerCase())
                .join(", ")}.`
            : undefined
        }
        settingsHref="/admin/settings/company"
      />

      <article className="doc doc--portrait">
        <h1 className="doc-title">
          Коммерческое предложение {offer.number} от {longDateFmt.format(created)}
        </h1>

        <div style={{ marginTop: "4mm" }}>
          <div>
            <b>Исполнитель:</b>{" "}
            {[
              seller.company_name,
              seller.company_inn && `ИНН ${seller.company_inn}`,
              seller.company_address,
              seller.company_phone,
            ]
              .filter(Boolean)
              .join(", ") || "-"}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Заказчик:</b>{" "}
            {[
              offer.clientCompany,
              offer.clientName,
              offer.clientPhone,
              offer.clientEmail,
              offer.clientAddress,
            ]
              .filter(Boolean)
              .join(", ")}
          </div>
        </div>

        <table className="doc-items">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>№</th>
              <th>Наименование</th>
              <th style={{ width: "12%" }}>Кол-во</th>
              <th style={{ width: "10%" }}>Ед.</th>
              <th style={{ width: "16%" }}>Цена</th>
              <th style={{ width: "18%" }}>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id}>
                <td className="c">{n + 1}</td>
                <td>
                  {i.name}
                  {i.description && (
                    <div style={{ fontSize: "7.5pt", color: "#444" }}>{i.description}</div>
                  )}
                </td>
                <td className="c">{i.quantity}</td>
                <td className="c">{i.unit ?? "шт."}</td>
                <td className="r">{money.format(Number(i.price))}</td>
                <td className="r">{money.format(Number(i.total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="r" style={{ fontWeight: 400 }}>
                Сумма позиций:
              </td>
              <td className="r" style={{ fontWeight: 400 }}>
                {money.format(subtotal)}
              </td>
            </tr>
            {discount > 0 && (
              <tr>
                <td colSpan={5} className="r" style={{ fontWeight: 400 }}>
                  Скидка {discountPercent.toFixed(0)}%:
                </td>
                <td className="r" style={{ fontWeight: 400 }}>
                  − {money.format(discount)}
                </td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="r">
                Итого:
              </td>
              <td className="r">{money.format(total)}</td>
            </tr>
          </tfoot>
        </table>

        <p style={{ marginTop: "4mm" }}>
          Всего наименований {items.length}, на сумму {money.format(total)} руб.
          <br />
          <b>{rublesInWords(total)}</b>
        </p>

        <div style={{ marginTop: "5mm" }}>
          <b>Условия</b>
          <ul style={{ margin: "2mm 0 0", paddingLeft: "6mm" }}>
            {offer.productionDays !== null && (
              <li>
                Срок изготовления: {offer.productionDays}{" "}
                {plural(offer.productionDays, ["рабочий день", "рабочих дня", "рабочих дней"])}{" "}
                с момента согласования макета.
              </li>
            )}
            {prepayment > 0 && <li>Предоплата: {prepayment.toFixed(0)}%.</li>}
            {offer.paymentTerms && <li>{offer.paymentTerms}</li>}
            {/* Формат даты уже заканчивается на «г.» - своя точка сверху
                давала «2026 г..» */}
            {validUntil && (
              <li>Предложение действительно до {longDateFmt.format(validUntil)}</li>
            )}
            <li>
              Без налога (НДС) - исполнитель применяет упрощённую систему
              налогообложения.
            </li>
          </ul>
        </div>

        {offer.notes && (
          <p style={{ marginTop: "4mm", whiteSpace: "pre-line" }}>{offer.notes}</p>
        )}

        <div className="doc-signatures" style={{ marginTop: "12mm" }}>
          <div className="doc-signature">
            <div className="doc-signature__role">Исполнитель</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot">{seller.company_director}</span>
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
