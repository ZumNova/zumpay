import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zumpay Wallet",
  description: "Billetera cripto no custodial para BTC, ETH y redes EVM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
