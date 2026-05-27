import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operaciones · Sudameris Seguros",
  description: "Plataforma de información para Cobranzas, Atención al Cliente, Ventas y procesos operativos — Operada por Voicenter S.A.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
