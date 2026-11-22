import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { isProductionIndexingEnabled } from "./robots";
import "./globals.css";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";

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

const title = "MetaDeals4U: Best Online Deals, Offers & Discounts in India";
const description = "Verified deals and price drops from Amazon, Flipkart, Myntra and more Indian stores, updated every day on MetaDeals4U.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in"),
  title,
  description,
  openGraph: { title, description, siteName: "MetaDeals4U", locale: "en_IN", type: "website" },
  twitter: { card: "summary", title, description },
  robots: { index: allowIndexing, follow: allowIndexing },
  referrer: "strict-origin-when-cross-origin",
  other: {
    "cuelinks-verification": ["VERIFY-CL-YN1ZO95L", "VERIFY-CL-JBFDE9Y6"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <head>
        <GoogleTagManager />
      </head>
      <body className={manrope.variable}>
        {children}
        <AnalyticsTracker />
        <ConsentBanner />
      </body>
    </html>
  );
}
