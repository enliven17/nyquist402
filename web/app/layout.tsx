import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nyquist402",
  description: "Refundable x402 payments on Stellar: authorize, capture, void, refund.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
