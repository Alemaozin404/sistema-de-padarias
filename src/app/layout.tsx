import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
