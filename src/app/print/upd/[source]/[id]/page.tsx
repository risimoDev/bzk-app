import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { orderPrintAccess } from "@/lib/order-access";
import { type OrderSource } from "@/lib/upd";
import { buildUpd, longDate, type UpdRow } from "@/lib/upd";
import { missingFields, REQUIRED_FOR_DOCUMENTS, COMPANY_FIELDS } from "@/lib/company";
import { PrintBar } from "@/components/print/PrintBar";
import { docStyles } from "@/components/print/doc-styles";
import { parseId } from "@/lib/ids";

export const metadata: Metadata = {
  title: "УПД",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Универсальный передаточный документ.
 *
 * Печатается в альбомной ориентации: в форме девятнадцать граф, на
 * книжном листе они превращаются в нечитаемую полосу. Буквенные заголовки
 * первых двух граф (А и Б) и графы прослеживаемости 12–13 в старом
 * шаблоне отсутствовали - нумерация там шла «1, 1а, 2…», что не совпадает
 * с бланком из постановления.
 */
export default async function UpdPrintPage({ params }: PageProps<"/print/upd/[source]/[id]">) {
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

  const upd = await buildUpd(source, orderId);
  if (!upd) notFound();

  const { seller, buyer, rows, extra } = upd;
  const missing = missingFields(seller, REQUIRED_FOR_DOCUMENTS);

  // Надбавка и доставка идут отдельной строкой: иначе итог документа
  // разойдётся с суммой, которую клиент фактически платит
  const allRows: UpdRow[] =
    Math.abs(extra) < 0.01
      ? rows
      : [
          ...rows,
          {
            index: rows.length + 1,
            name: upd.extraLabel,
            unit: "усл.",
            quantity: 1,
            price: extra,
            sum: extra,
          },
        ];

  // Форму продавца читаем по ИНН: 12 цифр - предприниматель, 10 - организация.
  // Раньше строка подписи выбиралась по покупателю, что к продавцу отношения
  // не имеет и на заказах от юрлиц дало бы «Руководитель организации» у ИП
  const sellerIsSoleTrader = seller.company_inn.replace(/\D/g, "").length === 12;
  const sellerLine = [seller.company_name, seller.company_address].filter(Boolean).join(", ");
  const buyerLine = [buyer.name, buyer.address].filter(Boolean).join(", ");
  const sellerTax = [seller.company_inn, seller.company_kpp].filter(Boolean).join("/");
  const buyerTax = [buyer.inn, buyer.kpp].filter(Boolean).join("/");

  return (
    <>
      <style>{docStyles}</style>
      <style>{`@page { size: A4 landscape; margin: 10mm; }`}</style>

      <PrintBar
        title={`УПД по заказу №${upd.documentNumber}`}
        backHref={backHref}
        // Предупреждение и ссылка в настройки - только сотруднику: клиенту
        // они ни к чему, а адрес админки ему знать незачем
        warning={
          access.isStaff && missing.length > 0
            ? `Не заполнены реквизиты продавца: ${missing
                .map((f) => COMPANY_FIELDS[f].toLowerCase())
                .join(", ")}. Документ выйдет с пустыми полями.`
            : undefined
        }
        settingsHref={access.isStaff ? "/admin/settings/company" : undefined}
      />

      <article className="doc doc--landscape">
        <header className="doc-head">
          <div className="doc-head__title">
            Универсальный
            <br />
            передаточный
            <br />
            документ
          </div>

          <div className="doc-head__meta">
            <div>
              Счёт-фактура № <span className="fill">-</span> от{" "}
              <span className="fill">-</span> <span className="ref">(1)</span>
            </div>
            <div>
              Исправление № <span className="fill">-</span> от{" "}
              <span className="fill">-</span> <span className="ref">(1а)</span>
            </div>
            <p className="doc-note">
              Счёт-фактура не выставляется: продавец применяет налог на профессиональный доход (Федеральный закон от 27.11.2018 № 422-ФЗ)
              и не признаётся плательщиком НДС.
            </p>
          </div>

          <div className="doc-head__law">
            Приложение № 1 к постановлению Правительства Российской Федерации от 26 декабря
            2011 г. № 1137 (в редакции постановления Правительства Российской Федерации от
            16 августа 2024 г. № 1096)
          </div>
        </header>

        <div className="doc-status">
          <span>Статус:</span>
          <span className="doc-status__box">2</span>
          <span className="doc-status__legend">
            1 - счёт-фактура и передаточный документ (акт); 2 - передаточный документ (акт)
          </span>
        </div>

        <div className="doc-parties">
          <Party
            label="Продавец"
            ref1="(2)"
            name={seller.company_name || "-"}
            address={seller.company_address || "-"}
            refAddr="(2а)"
            tax={sellerTax || "-"}
            refTax="(2б)"
            taxLabel="ИНН/КПП продавца"
          />
          <Party
            label="Покупатель"
            ref1="(6)"
            name={buyer.name}
            address={buyer.address}
            refAddr="(6а)"
            tax={buyerTax || "-"}
            refTax="(6б)"
            taxLabel="ИНН/КПП покупателя"
          />
        </div>

        <div className="doc-extra">
          <div>
            <b>Грузоотправитель и его адрес:</b>{" "}
            <span className="fill">{sellerLine || "-"}</span> <span className="ref">(3)</span>
          </div>
          <div>
            <b>Валюта: наименование, код:</b>{" "}
            <span className="fill">Российский рубль, 643</span>{" "}
            <span className="ref">(7)</span>
          </div>
          <div>
            <b>Грузополучатель и его адрес:</b> <span className="fill">{buyerLine}</span>{" "}
            <span className="ref">(4)</span>
          </div>
          <div>
            <b>Идентификатор государственного контракта, договора (соглашения):</b>{" "}
            <span className="fill">-</span> <span className="ref">(8)</span>
          </div>
          <div>
            <b>К платёжно-расчётному документу №:</b> <span className="fill">-</span>{" "}
            <span className="ref">(5)</span>
          </div>
          <div>
            <b>Документ об отгрузке:</b>{" "}
            <span className="fill">
              УПД № {upd.documentNumber} от {shortDate.format(upd.documentDate)}
            </span>{" "}
            <span className="ref">(5а)</span>
          </div>
        </div>

        <table className="doc-table">
          <thead>
            <tr>
              <th rowSpan={2}>№ п/п</th>
              <th rowSpan={2}>Код товара / работ, услуг</th>
              <th rowSpan={2} className="col-name">
                Наименование товара (описание выполненных работ, оказанных услуг),
                имущественного права
              </th>
              <th rowSpan={2}>Код вида товара</th>
              <th colSpan={2}>Единица измерения</th>
              <th rowSpan={2}>Количество (объём)</th>
              <th rowSpan={2}>Цена (тариф) за единицу измерения</th>
              <th rowSpan={2}>Стоимость товаров (работ, услуг) без налога - всего</th>
              <th rowSpan={2}>В том числе сумма акциза</th>
              <th rowSpan={2}>Налоговая ставка</th>
              <th rowSpan={2}>Сумма налога, предъявляемая покупателю</th>
              <th rowSpan={2}>Стоимость товаров (работ, услуг) с налогом - всего</th>
              <th colSpan={2}>Страна происхождения товара</th>
              <th rowSpan={2}>Регистрационный номер декларации на товары</th>
              <th colSpan={3}>Сведения о прослеживаемости</th>
            </tr>
            <tr>
              <th>код</th>
              <th>условное обозначение (национальное)</th>
              <th>цифровой код</th>
              <th>краткое наименование</th>
              <th>единица измерения</th>
              <th>количество</th>
              <th>стоимость</th>
            </tr>
            <tr className="doc-table__refs">
              <th>А</th>
              <th>Б</th>
              <th>1</th>
              <th>1а</th>
              <th>2</th>
              <th>2а</th>
              <th>3</th>
              <th>4</th>
              <th>5</th>
              <th>6</th>
              <th>7</th>
              <th>8</th>
              <th>9</th>
              <th>10</th>
              <th>10а</th>
              <th>11</th>
              <th>12</th>
              <th>12а</th>
              <th>13</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => (
              <tr key={r.index}>
                <td className="c">{r.index}</td>
                <td className="c">-</td>
                <td>{r.name}</td>
                <td className="c">-</td>
                <td className="c">-</td>
                <td className="c">{r.unit}</td>
                <td className="c">{r.quantity}</td>
                <td className="r">{money.format(r.price)}</td>
                <td className="r">{money.format(r.sum)}</td>
                <td className="c">без акциза</td>
                <td className="c">без НДС</td>
                <td className="c">-</td>
                <td className="r">{money.format(r.sum)}</td>
                <td className="c">-</td>
                <td className="c">-</td>
                <td className="c">-</td>
                <td className="c">-</td>
                <td className="c">-</td>
                <td className="c">-</td>
              </tr>
            ))}
            {/* Количество в итоге не складываем: единицы в строках разные -
                штуки и услуги. Бланк требует в этой графе X, а старый шаблон
                печатал их сумму, число без смысла */}
            <tr className="doc-table__total">
              <td colSpan={6} className="r">
                Всего к оплате
              </td>
              <td className="c">X</td>
              <td className="c">X</td>
              <td className="r">{money.format(upd.order.totalPrice)}</td>
              <td className="c">X</td>
              <td className="c">X</td>
              <td className="c">-</td>
              <td className="r">{money.format(upd.order.totalPrice)}</td>
              <td colSpan={6} />
            </tr>
          </tbody>
        </table>

        <div className="doc-sum">
          <b>Всего отпущено (передано) на сумму:</b> {upd.amountInWords}
        </div>

        <div className="doc-signatures">
          <Signature
            role={
              sellerIsSoleTrader
                ? "Индивидуальный предприниматель или иное уполномоченное лицо"
                : "Руководитель организации или иное уполномоченное лицо"
            }
            name={seller.company_director}
          />
          <Signature role="Главный бухгалтер или иное уполномоченное лицо" name={seller.company_accountant} />
        </div>

        <div className="doc-transfer">
          <div className="doc-transfer__col">
            <div>
              <b>Товар (груз) передал / услуги, результаты работ сдал</b>{" "}
              <span className="ref">(10)</span>
            </div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot" />
            </div>
            <div className="sign-caption">
              <span>(должность)</span>
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
            <div className="doc-transfer__date">
              Дата отгрузки, передачи (сдачи) {longDate(upd.documentDate)}{" "}
              <span className="ref">(11)</span>
            </div>
          </div>

          <div className="doc-transfer__col">
            <div>
              <b>Товар (груз) получил / услуги, результаты работ принял</b>{" "}
              <span className="ref">(15)</span>
            </div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot" />
            </div>
            <div className="sign-caption">
              <span>(должность)</span>
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
            <div className="doc-transfer__date">
              Дата получения (приёмки) «___» ______________ 20___ г.{" "}
              <span className="ref">(16)</span>
            </div>
          </div>
        </div>

        <div className="doc-basis">
          <div>
            <b>Основание передачи (сдачи) / получения (приёмки):</b>{" "}
            <span className="fill">Заказ № {upd.documentNumber}</span>{" "}
            <span className="ref">(8)</span>
          </div>
          <div>
            <b>Иные сведения об отгрузке, передаче:</b>{" "}
            <span className="fill">Претензий по количеству и качеству не имеется</span>{" "}
            <span className="ref">(9)</span>
          </div>
        </div>
      </article>
    </>
  );
}

function Party({
  label,
  ref1,
  name,
  address,
  refAddr,
  tax,
  refTax,
  taxLabel,
}: {
  label: string;
  ref1: string;
  name: string;
  address: string;
  refAddr: string;
  tax: string;
  refTax: string;
  taxLabel: string;
}) {
  return (
    <div className="doc-party">
      <div>
        <b>{label}:</b> <span className="fill">{name}</span>{" "}
        <span className="ref">{ref1}</span>
      </div>
      <div>
        <b>Адрес:</b> <span className="fill">{address}</span>{" "}
        <span className="ref">{refAddr}</span>
      </div>
      <div>
        <b>{taxLabel}:</b> <span className="fill">{tax}</span>{" "}
        <span className="ref">{refTax}</span>
      </div>
    </div>
  );
}

function Signature({ role, name }: { role: string; name: string }) {
  return (
    <div className="doc-signature">
      <div className="doc-signature__role">{role}</div>
      <div className="sign-line">
        <span className="sign-line__slot" />
        <span className="sign-line__slot">{name}</span>
      </div>
      <div className="sign-caption sign-caption--two">
        <span>(подпись)</span>
        <span>(ф. и. о.)</span>
      </div>
    </div>
  );
}
