import Link from "next/link";
import { ShoppingBag } from "lucide-react";

export function BrandLogo({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" className="brand" aria-label="MetaDeals4U home" onClick={onClick}>
      <span className="brand-mark">
        <ShoppingBag size={34} strokeWidth={1.8} />
        <span className="brand-streak" />
      </span>
      <span>
        <span className="brand-name">
          MetaDeals<span>4U</span>
        </span>
        <span className="brand-tagline">Deals • Offers • Best Prices</span>
      </span>
    </Link>
  );
}
