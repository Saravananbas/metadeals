import {
  ShoppingCart,
  ExternalLink,
} from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";
import { formatINR } from "@/features/deals/pricing";
import { StoreLogo } from "@/features/home/components/StoreLogo";

interface PurchaseOptionItem {
  id: string;
  merchant: string;
  priceMinor: number;
  destinationUrl: string;
  isAffiliate: boolean;
}

interface DealPurchasePanelProps {
  dealId: string;
  priceMinor: number;
  mrpMinor: number;
  discountPercent: number;
  savingsMinor: number;
  merchantName: string;
  merchantWebsite?: string;
  destinationUrl: string;
  expiresAt?: string | null;
  publishedAt?: string | null;
  options?: PurchaseOptionItem[];
}

/** Price, MRP, savings and the Buy Now button: shown directly under the product picture. */
export function DealPriceBuy({ dealId, priceMinor, mrpMinor, discountPercent, savingsMinor, merchantName, merchantLogoUrl }: { dealId: string; priceMinor: number; mrpMinor: number; discountPercent: number; savingsMinor: number; merchantName: string; merchantLogoUrl?: string | null }) {
  const buyNowUrl = `/go/${dealId}`;
  return (
    <div className={styles.priceBuy}>
    {/* Price Typography */}
    <div className={styles.priceBlock}>
      <div className={styles.dealPrice}>
        {formatINR(priceMinor / 100)}
      </div>

      <div className={styles.mrpLine}>
        <span className={styles.mrpPrice}>
          MRP {formatINR(mrpMinor / 100)}
        </span>
        {savingsMinor > 0 && (
          <span className={styles.savingsPill}>
            Save {formatINR(savingsMinor / 100)} ({discountPercent}% OFF)
          </span>
        )}
      </div>
    </div>

    <div className={styles.buyCol}>
    {/* Buy Now Primary CTA */}
    <a
      href={buyNowUrl}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={styles.buyNowBtn}
      id="buy-now-btn"
    >
      <ShoppingCart size={19} />
      <span>Buy Now</span>
    </a>
      <StoreLogo store={merchantName.toLowerCase()} name={merchantName} logoUrl={merchantLogoUrl} logoOnly />
    </div>

    </div>
  );
}

export function DealPurchasePanel({
  dealId,
  options = [],
}: DealPurchasePanelProps) {
  // Only the "compare other retailers" links remain here; price, Buy Now and the store logo are under the picture.
  if (options.length === 0) return null;
  return (
    <div className={styles.purchasePanel}>
      {/* Secondary Purchase Options (if multi-merchant deal exists) */}
      {options.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--md-color-text-secondary)" }}>
            Compare other retailers:
          </span>
          {options.map((opt) => (
            <a
              key={opt.id}
              href={`/go/${dealId}?option=${opt.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className={styles.secondaryMerchantBtn}
            >
              <span>{opt.merchant} · {formatINR(opt.priceMinor / 100)}</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
