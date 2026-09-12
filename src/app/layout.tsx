import type { Metadata, Viewport } from "next";
import { Oswald, Golos_Text, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // Относительно этого адреса Next разворачивает канонические ссылки и
  // картинки для соцсетей: без него в разметку попадают пути без домена,
  // а их поисковики и мессенджеры не понимают
  metadataBase: new URL(siteUrl),
  title: {
    default: "БЗК Принт - рекламно-производственное агентство",
    template: "%s · БЗК Принт",
  },
  description:
    "Печать, сувенирная продукция и наружная реклама в Перми. Берём заказ целиком: подбираем исполнение под задачу, согласуем макет и держим сроки. Расчёт онлайн, статус заказа в личном кабинете.",
};

export const viewport: Viewport = {
  themeColor: "#0e1417",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${oswald.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bone text-ink">{children}</body>
    </html>
  );
}
