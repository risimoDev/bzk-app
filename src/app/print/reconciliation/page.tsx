import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { readCompany } from "@/lib/company-db";
import { missingFields, REQUIRED_FOR_DOCUMENTS, COMPANY_FIELDS } from "@/lib/company";
import { rublesInWords } from "@/lib/num2words";
import { parseCalendarDate } from "@/lib/dates";
import { PrintBar } from "@/components/print/PrintBar";
import { docStyles } from "@/components/print/doc-styles";
import { loadReconciliation } from "@/lib/debts-db";
import { REPORT_TZ } from "@/lib/analytics";
import { defaultActPeriod, parsePartyKey, reconciliationRange } from "@/lib/debts";

export const metadata: Metadata = {
  title: "Акт сверки",
  robots: { index: false, follow: false },
};

const money = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REPORT_TZ,
});
// UTC: день берётся как полдень UTC и не должен сдвигаться поясом сервера
const longDateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** 'ГГГГ-ММ-ДД' в длинную дату без сдвига пояса: берём полдень UTC. */
const longDay = (day: string) => longDateFmt.format(new Date(`${day}T12:00:00Z`));
const shortDay = (day: string) => day.split("-").reverse().join(".");

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Акт сверки взаимных расчётов с клиентом или контрагентом за период.
 *
 * Две колонки: «по данным БЗК» заполнена, «по данным контрагента» пустая
 * - её вписывает контрагент перед подписью. Начисления идут по дате, когда
 * заказ стал готов или выдан, оплаты - по дате платежа; отменённые заказы
 * и заказы, ещё не готовые, в начисления не входят. Даты периода - по поясу
 * отчётов, последний день включается целиком. Только для сотрудников с
 * правом смотреть финансы.
 */
export default async function ReconciliationPrintPage({ searchParams }: PageProps<"/print/reconciliation">) {
  if (!(await can("finance", "view"))) redirect("/login?from=/admin/finance/debts");

  const sp = await searchParams;
  const partyKey = one(sp.party);
  const parsed = partyKey ? parsePartyKey(partyKey) : null;
  // По имени без привязки контрагента акт не строим: однофамильцев легко смешать
  if (!partyKey || !parsed || parsed.kind === "name") notFound();

  const defaults = defaultActPeriod();
  const rawFrom = one(sp.from);
  const rawTo = one(sp.to);
  const from = rawFrom ? parseCalendarDate(rawFrom) : defaults.from;
  const to = rawTo ? parseCalendarDate(rawTo) : defaults.to;
  if (!from || !to || from > to) notFound();

  const range = reconciliationRange(from, to);
  const [act, seller] = await Promise.all([loadReconciliation(partyKey, range), readCompany()]);
  if (!act) notFound();

  const missing = missingFields(seller, REQUIRED_FOR_DOCUMENTS);
  const warning =
    missing.length > 0
      ? `Не заполнены реквизиты: ${missing.map((f) => COMPANY_FIELDS[f].toLowerCase()).join(", ")}.`
      : undefined;

  const sellerLine =
    [
      seller.company_name,
      seller.company_inn && `ИНН ${seller.company_inn}`,
      seller.company_kpp && `КПП ${seller.company_kpp}`,
      seller.company_address,
    ]
      .filter(Boolean)
      .join(", ") || "-";
  const partyLine = [act.partyName, act.inn && `ИНН ${act.inn}`, act.address].filter(Boolean).join(", ");

  // Сальдо в колонки «дебет» (должен контрагент) и «кредит» (аванс / переплата)
  const debit = (n: number) => (n > 0 ? money.format(n) : "");
  const credit = (n: number) => (n < 0 ? money.format(-n) : "");

  const closing = act.closing;
  const verdict =
    Math.abs(closing) < 0.005
      ? "Задолженности нет."
      : closing > 0
        ? `Задолженность ${act.partyName} в пользу ${seller.company_short_name || "БЗК"}: ${money.format(closing)} руб. (${rublesInWords(closing)}).`
        : `Задолженность ${seller.company_short_name || "БЗК"} в пользу ${act.partyName} (аванс, переплата): ${money.format(-closing)} руб. (${rublesInWords(-closing)}).`;

  return (
    <>
      <style>{docStyles}</style>
      <style>{`@page { size: A4 portrait; margin: 12mm; }
.act-table { width: 100%; border-collapse: collapse; margin-top: 4mm; font-size: 8.5pt; }
.act-table th, .act-table td { border: 0.75pt solid #000; padding: 1.3mm 1.8mm; vertical-align: top; overflow-wrap: anywhere; }
.act-table th { font-weight: 700; text-align: center; }
.act-table td.n { text-align: right; white-space: nowrap; }
.act-table tr.sum td { font-weight: 700; }
.act-table tr { break-inside: avoid; }`}</style>

      <PrintBar
        title={`Акт сверки: ${act.partyName}`}
        backHref="/admin/finance/debts"
        warning={warning}
        settingsHref="/admin/settings/company"
      />

      <article className="doc doc--portrait">
        <h1 className="doc-title" style={{ textAlign: "center" }}>
          Акт сверки взаимных расчётов
        </h1>
        <p style={{ textAlign: "center", margin: "2mm 0 0" }}>
          за период с {longDay(from)} по {longDay(to)}
        </p>

        <div style={{ marginTop: "4mm" }}>
          <div>
            <b>Исполнитель:</b> {sellerLine}
          </div>
          <div style={{ marginTop: "2mm" }}>
            <b>Заказчик:</b> {partyLine}
          </div>
          <p style={{ marginTop: "3mm" }}>
            Мы, нижеподписавшиеся, составили настоящий акт о том, что состояние взаимных расчётов по данным учёта
            за указанный период следующее (в рублях):
          </p>
        </div>

        <table className="act-table">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: "12%" }}>
                Дата
              </th>
              <th rowSpan={2}>Операция</th>
              <th colSpan={2}>По данным БЗК</th>
              <th colSpan={2}>По данным контрагента</th>
            </tr>
            <tr>
              <th style={{ width: "13%" }}>Начислено (дебет)</th>
              <th style={{ width: "13%" }}>Оплачено (кредит)</th>
              <th style={{ width: "13%" }}>Начислено (дебет)</th>
              <th style={{ width: "13%" }}>Оплачено (кредит)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="sum">
              <td>{shortDay(from)}</td>
              <td>Сальдо на начало периода</td>
              <td className="n">{debit(act.opening)}</td>
              <td className="n">{credit(act.opening)}</td>
              <td />
              <td />
            </tr>
            {act.rows.map((r, i) => (
              <tr key={i}>
                <td>{dayFmt.format(r.at)}</td>
                <td>
                  {r.label}
                  {r.approximate && " *"}
                </td>
                <td className="n">{r.charge > 0 ? money.format(r.charge) : ""}</td>
                <td className="n">{r.payment > 0 ? money.format(r.payment) : ""}</td>
                <td />
                <td />
              </tr>
            ))}
            {act.rows.length === 0 && (
              <tr>
                <td />
                <td>За период операций нет</td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            )}
            <tr className="sum">
              <td />
              <td>Обороты за период</td>
              <td className="n">{money.format(act.charged)}</td>
              <td className="n">{money.format(act.paid)}</td>
              <td />
              <td />
            </tr>
            <tr className="sum">
              <td>{shortDay(to)}</td>
              <td>Сальдо на конец периода</td>
              <td className="n">{debit(closing)}</td>
              <td className="n">{credit(closing)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>

        <p style={{ marginTop: "4mm" }}>
          <b>По данным БЗК на {shortDay(to)}:</b> {verdict}
        </p>
        <p style={{ marginTop: "2mm", fontSize: "7.5pt", color: "#333" }}>
          Начисления отражены по дате, когда заказ стал готов к выдаче или передан клиенту; оплаты - по дате
          платежа. Отменённые заказы и заказы, не доведённые до готовности, в начисления не входят.
          {act.hasApproximate &&
            " * Дата начисления приблизительная: записи о готовности заказа нет, взята дата заказа."}
        </p>

        <div className="doc-signatures" style={{ marginTop: "10mm" }}>
          <div className="doc-signature">
            <div className="doc-signature__role">От БЗК</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot">{seller.company_director}</span>
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
            <div style={{ marginTop: "4mm", fontSize: "8pt" }}>М. П.</div>
          </div>
          <div className="doc-signature">
            <div className="doc-signature__role">От контрагента</div>
            <div className="sign-line">
              <span className="sign-line__slot" />
              <span className="sign-line__slot" />
            </div>
            <div className="sign-caption sign-caption--two">
              <span>(подпись)</span>
              <span>(ф. и. о.)</span>
            </div>
            <div style={{ marginTop: "4mm", fontSize: "8pt" }}>М. П.</div>
          </div>
        </div>
      </article>
    </>
  );
}
