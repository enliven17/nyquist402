import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";

const sans = Inter_Tight({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Nyquist402 · Refundable x402 payments on Stellar",
  description: "The x402 auth-capture scheme for Stellar: authorize a maximum, capture what the work cost, void or refund onchain.",
  openGraph: { images: "/brand/og.png" },
  twitter: { card: "summary_large_image", images: "/brand/og.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <noscript><style>{"[data-split]{opacity:1!important}"}</style></noscript>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
