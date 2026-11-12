import {
  ShoppingCart,
  ExternalLink,
  ShieldCheck,
  Clock,
  RotateCcw,
  CheckCircle,
  TrendingDown,
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

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "Recently added";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently added";
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Posted just now";
    if (diffHours < 24) return `Posted ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Posted ${diffDays}d ago`;
  } catch {
    return "Recently added";
  }
}

function formatExpiryTime(dateStr?: string | null): string {
  if (!dateStr) return "Limited time offer · While stocks last";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Limited time offer · While stocks last";
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Offer expiring soon";
    if (diffDays === 1) return "Ends in 24 hours";
    return `Ends in ${diffDays} days`;
  } catch {
    return "Limited time offer";
  }
}

export function DealPurchasePanel({
  dealId,
  priceMinor,
  mrpMinor,
  discountPercent,
  savingsMinor,
  merchantName,
  destinationUrl,
  expiresAt,
  publishedAt,
  options = [],
}: DealPurchasePanelProps) {
  // Buy Now link strictly points to affiliate redirect route /go/[dealId]
  const buyNowUrl = `/go/${dealId}`;

  return (
    <div className={styles.purchasePanel}>
      {/* Best Price Header */}
      <div className={styles.priceTagHeader}>
        <CheckCircle size={15} color="var(--md-color-success)" />
        <span>Best Price Verified</span>
      </div>

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

      {/* Buy Now Primary CTA */}
      <a
        href={buyNowUrl}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className={styles.buyNowBtn}
        id="buy-now-btn"
      >
        <ShoppingCart size={19} />
        <span>Buy Now at {merchantName}</span>
      </a>

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
      ) : (
        <a
          href={destinationUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className={styles.secondaryMerchantBtn}
        >
          <span>View Product Page</span>
          <ExternalLink size={14} />
        </a>
      )}

      {/* Merchant Branding Badge */}
      <div className={styles.merchantBox}>
        <div className={styles.merchantInfo}>
          <StoreLogo store={merchantName.toLowerCase()} />
          <div>
            <div className={styles.merchantName}>{merchantName}</div>
            <div className={styles.storeSubtitle}>Verified Partner Retailer</div>
          </div>
        </div>
        <ShieldCheck size={20} color="var(--md-color-success)" />
      </div>

      {/* Trust & Policy Details */}
      <div className={styles.panelMetaList}>
        <div className={styles.metaRow}>
          <Clock size={14} color="var(--md-color-primary-hover)" />
          <span>{formatExpiryTime(expiresAt)}</span>
        </div>
        <div className={styles.metaRow}>
          <RotateCcw size={14} color="var(--md-color-primary-hover)" />
          <span>7–14 Days Return Policy subject to retailer terms</span>
        </div>
        <div className={styles.metaRow}>
          <TrendingDown size={14} color="var(--md-color-success)" />
          <span>{formatRelativeTime(publishedAt)}</span>
        </div>
      </div>
    </div>
  );
}
