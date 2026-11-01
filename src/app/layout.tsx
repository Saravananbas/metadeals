import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MetaDeals4U",
  description: "MetaDeals4U — India's smart shopping hub.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
