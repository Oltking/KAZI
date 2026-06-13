import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { WalletProvider } from "../lib/wallet";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Kazi — your money at work",
  description:
    "Capital-protected, streaming-yield savings on Celo. Your principal is never put at risk.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1f17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
