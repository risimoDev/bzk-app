/**
 * Стили печатных форм.
 *
 * Отдельная строка, а не Tailwind: у первичных документов своя типографика
 * - Times, чёрные линии, миллиметровые поля, - и смешивать её с
 * фирменными утилитами витрины значит тащить в бланк лишние правила.
 * Строка вставляется в <style> прямо на странице документа.
 */
export const docStyles = `
.doc {
  box-sizing: border-box;
  margin: 0 auto;
  background: #fff;
  color: #000;
  font-family: "Times New Roman", "Liberation Serif", Times, serif;
  font-size: 8.5pt;
  line-height: 1.25;
  padding: 10mm;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}
.doc--landscape { width: 297mm; }
.doc--portrait { width: 210mm; }

.doc b { font-weight: 700; }
.doc .ref { font-size: 7pt; color: #444; white-space: nowrap; }
.doc .fill {
  border-bottom: 1px solid #000;
  padding: 0 2px;
}
.doc .c { text-align: center; }
.doc .r { text-align: right; }

/* ------------------------------------------------------------ шапка */
.doc-head {
  display: grid;
  grid-template-columns: 42mm 1fr 62mm;
  gap: 4mm;
  align-items: start;
}
.doc-head__title {
  font-size: 11pt;
  font-weight: 700;
  line-height: 1.15;
}
.doc-head__meta > div + div { margin-top: 1.5mm; }
.doc-head__law { font-size: 7pt; text-align: right; line-height: 1.2; }
.doc-note { margin: 1.5mm 0 0; font-size: 7pt; color: #333; }

.doc-status {
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-top: 3mm;
}
.doc-status__box {
  display: inline-block;
  min-width: 7mm;
  padding: 0.5mm 1.5mm;
  border: 1.5pt solid #000;
  text-align: center;
  font-weight: 700;
}
.doc-status__legend { font-size: 7pt; color: #333; }

/* ---------------------------------------------------------- стороны */
.doc-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 8mm;
  margin-top: 3mm;
}
.doc-party > div + div { margin-top: 1.2mm; }

.doc-extra {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.2mm 8mm;
  margin-top: 3mm;
}

/* ---------------------------------------------------------- таблица */
.doc-table {
  width: 100%;
  margin-top: 4mm;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 7pt;
}
.doc-table th,
.doc-table td {
  border: 0.75pt solid #000;
  padding: 1mm 0.8mm;
  vertical-align: top;
  /* Длинные названия материалов не должны разрывать колонки */
  overflow-wrap: anywhere;
}
.doc-table th {
  text-align: center;
  vertical-align: middle;
  font-weight: 400;
  line-height: 1.1;
}
.doc-table .col-name { width: 22%; }
.doc-table__refs th { font-size: 6.5pt; color: #333; }
.doc-table__total td { font-weight: 700; }

.doc-sum { margin-top: 3mm; }

/* ---------------------------------------------------------- подписи */
.doc-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8mm;
  margin-top: 6mm;
}
.doc-signature__role { min-height: 8mm; font-weight: 700; }
.sign-line {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6mm;
  margin-top: 6mm;
}
.sign-line__slot {
  border-bottom: 0.75pt solid #000;
  min-height: 4.5mm;
  text-align: center;
}
.sign-caption {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6mm;
  margin-top: 0.8mm;
  font-size: 7pt;
  color: #333;
  text-align: center;
}
.sign-caption--two { grid-template-columns: 1fr 1fr; }

.doc-transfer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8mm;
  margin-top: 6mm;
  padding-top: 3mm;
  border-top: 1.5pt solid #000;
}
.doc-transfer__col .sign-line { grid-template-columns: 1fr 1fr 1fr; }
.doc-transfer__date { margin-top: 3mm; }

.doc-basis { margin-top: 4mm; }
.doc-basis > div + div { margin-top: 1.2mm; }

/* -------------------------------------------------- счёт на оплату */
.doc-bank {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.doc-bank td { border: 0.75pt solid #000; padding: 1.2mm 2mm; vertical-align: middle; }
.doc-bank .label { font-size: 7.5pt; color: #333; }
.doc-bank .num { font-family: "Courier New", monospace; letter-spacing: 0.4pt; }

.doc-title {
  margin: 5mm 0 1mm;
  font-size: 14pt;
  font-weight: 700;
  border-bottom: 2pt solid #000;
  padding-bottom: 1.5mm;
}

.doc-items {
  width: 100%;
  margin-top: 4mm;
  border-collapse: collapse;
  font-size: 9pt;
}
.doc-items th,
.doc-items td {
  border: 0.75pt solid #000;
  padding: 1.5mm 2mm;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.doc-items th { font-weight: 700; text-align: center; font-size: 8pt; }
.doc-items tfoot td { border: none; font-weight: 700; padding-top: 2mm; }

.doc-qr {
  display: grid;
  grid-template-columns: 34mm 1fr;
  gap: 5mm;
  align-items: start;
  margin-top: 6mm;
  padding: 3mm;
  border: 0.75pt dashed #000;
}
.doc-qr svg { width: 34mm; height: 34mm; display: block; }
.doc-qr__text { font-size: 8pt; }
.doc-qr__title { font-weight: 700; margin-bottom: 1.5mm; }

@media print {
  .no-print { display: none !important; }
  .doc {
    width: auto;
    padding: 0;
    box-shadow: none;
    margin: 0;
  }
  .doc-table { page-break-inside: auto; }
  .doc-table tr { page-break-inside: avoid; }
}
`;
