import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { isProductionIndexingEnabled } from "./robots";
import "./globals.css";

const allowIndexing = isProductionIndexingEnabled({
  nodeEnv: process.env.NODE_ENV,
  appEnv: process.env.APP_ENV,
  publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "MetaDeals4U",
  description: "MetaDeals4U — India's smart shopping hub.",
  robots: { index: allowIndexing, follow: allowIndexing },
  referrer: "strict-origin-when-cross-origin",
  other: {
    "cuelinks-verification": "VERIFY-CL-YN1ZO95L",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <head>
        <meta name="cuelinks-verification" content="VERIFY-CL-YN1ZO95L" />
      </head>
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
