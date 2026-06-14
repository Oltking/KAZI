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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://kazi-agent.vercel.app"),
  title: "Kazi · your money at work",
  description:
    "Capital-protected, streaming-yield savings on Celo. Your principal is never put at risk.",
  icons: {
    icon: [{ url: "/kazi.webp", type: "image/webp" }],
    shortcut: ["/kazi.webp"],
    apple: [{ url: "/kazi.webp" }],
  },
  openGraph: {
    title: "Kazi · your money at work",
    description:
      "Capital-protected, streaming-yield savings on Celo. Your principal is never put at risk.",
    images: [{ url: "/kazi.webp", width: 512, height: 512, alt: "Kazi" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Kazi · your money at work",
    description: "Capital-protected, streaming-yield savings on Celo.",
    images: ["/kazi.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#e8ecea",
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
