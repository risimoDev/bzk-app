/**
 * Показ тела документа.
 *
 * HTML приходит уже очищенным по белому списку тегов (safeDocumentHtml),
 * поэтому в разметку он вставляется как есть. Рамки таблиц старые шаблоны
 * задавали блоком <style> внутри самого документа - этот тег вырезается,
 * иначе его правила разошлись бы по всей админке. Взамен та же вёрстка
 * описана здесь и ограничена контейнером документа.
 */
export function DocumentBody({ html }: { html: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white p-6 text-[13px] leading-normal text-black shadow-sm sm:p-8">
      <style>{`
        .doc-html { font-family: "Times New Roman", "Liberation Serif", Times, serif; }
        .doc-html table { border-collapse: collapse; width: 100%; }
        .doc-html td, .doc-html th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
        .doc-html .noborder td, .doc-html .noborder th { border: none; padding: 2px 6px 2px 0; }
        .doc-html .text-right { text-align: right; }
        .doc-html .items-totals-simple { margin-top: 8px; text-align: right; }
        .doc-html p { margin: 0 0 6px; }
        .doc-html h1, .doc-html h2, .doc-html h3 { margin: 12px 0 6px; font-weight: 700; }
      `}</style>
      <div className="doc-html" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
