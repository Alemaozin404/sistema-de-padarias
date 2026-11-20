import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Gestão para padarias",
    template: "%s · Gestão para padarias",
  },
  description:
    "Plataforma de gestão para padarias e panificadoras: vitrine digital, produtos, estoque, produção e controle da assinatura.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-screen antialiased font-body">
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
