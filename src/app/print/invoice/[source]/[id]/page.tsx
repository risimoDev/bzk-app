import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { orderPrintAccess } from "@/lib/order-access";
import { type OrderSource } from "@/lib/upd";
import { buildUpd } from "@/lib/upd";
import {
  missingFields,
  REQUIRED_FOR_DOCUMENTS,
  REQUIRED_FOR_QR,
  COMPANY_FIELDS,
} from "@/lib/company";
import { paymentQrSvg } from "@/lib/payment-qr";
import { PrintBar } from "@/components/print/PrintBar";
import { docStyles } from "@/components/print/doc-styles";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "Счёт на оплату",
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
 * Счёт на оплату с платёжным QR-кодом.
 *
 * Форма счёта не утверждена законом - обязательны только реквизиты
 * сторон, перечень и сумма. Зато QR-код по ГОСТ Р 56042-2014 читают все
 * банковские приложения, и клиенту не приходится перебивать двадцать
 * цифр расчётного счёта руками.
 */
export default async function InvoicePrintPage({ params }: PageProps<"/print/invoice/[source]/[id]">) {
  const { source: rawSource, id } = await params;
  const orderId = parseId(id);
  if (orderId === null) notFound();

  // Номера сайтовых и менеджерских заказов идут своими
  // последовательностями и пересекаются - без источника «заказ № 17»
  // означает два разных заказа
  if (rawSource !== "site" && rawSource !== "external") notFound();
  const source = rawSource as OrderSource;

  // Клиенту документы открывает менеджер: до этого их видит только он
  const access = await orderPrintAccess(source, orderId);
  if (!access.allowed) notFound();
  const backHref = access.backHref;

  const doc = await buildUpd(source, orderId);
  if (!doc) notFound();

  const { seller, buyer, rows, extra } = doc;

  const items =
    Math.abs(extra) < 0.01
      ? rows
      : [
          ...rows,
          {
            index: rows.length + 1,
            name: doc.extraLabel,
            unit: "усл.",
            quantity: 1,
            price: extra,
            sum: extra,
          },
        ];

  const missingDoc = missingFields(seller, REQUIRED_FOR_DOCUMENTS);
  const missingQr = missingFields(seller, REQUIRED_FOR_QR);

  // QR рисуем только с полными банковскими реквизитами: код с пустым
  // счётом банк не примет, а клиент об этом узнает уже у кассы
  const qr =
    missingQr.length === 0
      ? await paymentQrSvg({
          name: seller.company_name,
          personalAcc: seller.company_bank_account,
          bankName: seller.company_bank_name,
          bic: seller.company_bank_bic,
          correspAcc: seller.company_bank_corr_account,
          payeeInn: seller.company_inn,
          kpp: seller.company_kpp || undefined,
          sum: doc.order.totalPrice,
          purpose: `Оплата по счёту № ${doc.documentNumber} от ${longDateFmt.format(doc.documentDate)}. Без НДС.`,
          // LastName в ГОСТе - фамилия плательщика-физлица. Названию
          // организации там не место, поэтому юрлицам поле не отправляем
          payerName: buyer.isCorporate ? undefined : buyer.name,
          docNo: doc.documentNumber,
        })
      : null;

  const warnings = [
    missingDoc.length > 0
      ? `Не заполнены реквизиты: ${missingDoc.map((f) => COMPANY_FIELDS[f].toLowerCase()).join(", ")}.`
      : null,
    missingQr.length > 0
      ? `QR-код не построен: не хватает банковских реквизитов (${missingQr
          .map((f) => COMPANY_FIELDS[f].toLowerCase())
          .join(", ")}).`
      : null,
  ].filter(Boolean);

  return (
    <>
      <style>{docStyles}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>

      <PrintBar
        title={`Счёт № ${doc.documentNumber}`}
        backHref={backHref}
        warning={warnings.length > 0 ? warnings.join(" ") : undefined}
        settingsHref="/admin/settings/company"
      />

      <article className="doc doc--portrait">
        <table className="doc-bank">
          <tbody>
            <tr>
              <td rowSpan={2} style={{ width: "58%" }}>
                <div className="label">Банк получателя</div>
                <div>{seller.company_bank_name || "-"}</div>
              </td>
              <td className="label" style={{ width: "10%" }}>
                БИК
              </td>
              <td className="num" style={{ width: "32%" }}>
                {seller.company_bank_bic || "-"}
              </td>
            </tr>
            <tr>
              <td className="label">Сч. №</td>
              <td className="num">{seller.company_bank_corr_account || "-"}</td>
            </tr>
            <tr>
              <td className="label">ИНН {seller.company_inn || "-"}</td>
              <td className="label">КПП {seller.company_kpp || "-"}</td>
              <td rowSpan={2} className="num">
                {seller.company_bank_account || "-"}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <div className="label">Получатель</div>
                <div>{seller.company_name || "-"}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <h1 className="doc-title">
          Счёт на оплату № {doc.documentNumber} от {longDateFmt.format(doc.documentDate)}
        </h1>

        <div style={{ marginTop: "4mm" }}>
          <div>
            <b>Поставщик:</b>{" "}
            {[
              seller.company_name,
              seller.company_inn && `ИНН ${seller.company_inn}`,
              seller.company_kpp && `КПП ${seller.company_kpp}`,
              seller.company_address,
            ]
              .filter(Boolean)
              .join(", ") || "-"}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Покупатель:</b>{" "}
            {[
              buyer.name,
              buyer.inn && `ИНН ${buyer.inn}`,
              buyer.kpp && `КПП ${buyer.kpp}`,
              buyer.address,
            ]
              .filter(Boolean)
              .join(", ")}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Основание:</b> заказ № {doc.documentNumber} от{" "}
            {longDateFmt.format(doc.documentDate)}
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
            {items.map((r) => (
              <tr key={r.index}>
                <td className="c">{r.index}</td>
                <td>{r.name}</td>
                <td className="c">{r.quantity}</td>
                <td className="c">{r.unit}</td>
                <td className="r">{money.format(r.price)}</td>
                <td className="r">{money.format(r.sum)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="r">
                Итого:
              </td>
              <td className="r">{money.format(doc.order.totalPrice)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="r" style={{ fontWeight: 400 }}>
                Без налога (НДС):
              </td>
              <td className="r" style={{ fontWeight: 400 }}>
                -
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="r">
                Всего к оплате:
              </td>
              <td className="r">{money.format(doc.order.totalPrice)}</td>
            </tr>
          </tfoot>
        </table>

        <p style={{ marginTop: "4mm" }}>
          Всего наименований {items.length}, на сумму {money.format(doc.order.totalPrice)} руб.
          <br />
          <b>{doc.amountInWords}</b>
        </p>

        <p style={{ marginTop: "3mm", fontSize: "8pt" }}>
          Без налога (НДС) - продавец применяет упрощённую систему налогообложения и не
          признаётся плательщиком налога на добавленную стоимость.
        </p>

        {qr && (
          <div className="doc-qr">
            {/* Готовый SVG от генератора: строка проверена, разметку не собираем из пользовательских данных */}
            <div dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="doc-qr__text">
              <div className="doc-qr__title">Оплата по QR-коду</div>
              <p style={{ margin: 0 }}>
                Наведите камеру банковского приложения - реквизиты, сумма и назначение
                платежа подставятся автоматически. Формат ГОСТ Р 56042-2014.
              </p>
              <p style={{ margin: "2mm 0 0" }}>
                Счёт действителен к оплате в течение 5 банковских дней. Товар отпускается по
                факту прихода денег на расчётный счёт.
              </p>
            </div>
          </div>
        )}

        <div className="doc-signatures" style={{ marginTop: "10mm" }}>
          <div className="doc-signature">
            <div className="doc-signature__role">Руководитель</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot">{seller.company_director}</span>
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
          </div>
          {seller.company_accountant && (
            <div className="doc-signature">
              <div className="doc-signature__role">Бухгалтер</div>
              <div className="sign-line">
                <span className="sign-line__slot" />
                <span className="sign-line__slot">{seller.company_accountant}</span>
              </div>
              <div className="sign-caption sign-caption--two">
                <span>(подпись)</span>
                <span>(ф. и. о.)</span>
              </div>
            </div>
          )}
        </div>
      </article>
    </>
  );
}
