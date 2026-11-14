import { CookieSettingsButton } from "@/components/analytics/CookieSettingsButton";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} MetaDeals4U · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms &amp; Conditions</Link> · <Link href="/disclaimer">Disclaimer</Link> · <Link href="/cookies">Cookies</Link> · <CookieSettingsButton /></p>
      <p>Prices may change. Check final offers at the retailer. Affiliate links may earn us a commission.</p>
    </footer>
  );
}
