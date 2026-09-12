/**
 * Обёртка для печатных форм: УПД, счетов, актов.
 *
 * Здесь сознательно нет ни шапки, ни фирменных цветов. Первичный
 * документ должен выглядеть как документ - чёрным по белому, шрифтом с
 * засечками, в границах листа А4. Всё, что не относится к бумаге,
 * скрывается при печати классом no-print.
 */
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <div className="print-root bg-neutral-200 py-6 print:bg-white print:py-0">{children}</div>;
}
