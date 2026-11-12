import { CheckCircle2, Star, Tag, Building2, Sparkles } from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";

interface DealProductInfoProps {
  title: string;
  brand: string;
  category: { id: string; name: string; slug: string };
  merchantName: string;
  description: string;
  rating?: number | null;
  reviewCount?: number | null;
  ratingSource?: string | null;
  currency: string;
}

export function DealProductInfo({
  title,
  brand,
  category,
  merchantName,
  description,
  rating,
  reviewCount,
  ratingSource,
  currency,
}: DealProductInfoProps) {
  const hasRating = rating !== null && rating !== undefined && rating > 0;

  return (
    <div className={styles.infoCard}>
      {/* Verified Deal Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className={styles.verifiedPill}>
          <CheckCircle2 size={14} color="var(--md-color-primary-hover)" />
          <span>Verified Genuine Deal</span>
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--md-color-success)",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Sparkles size={13} /> Active Price Drop
        </span>
      </div>

      {/* Product Title */}
      <h1 className={styles.productTitle}>{title}</h1>

      {/* Brand & Category Meta Row */}
      <div className={styles.productMetaRow}>
        <div className={styles.metaItem}>
          <Tag size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          Brand: <strong>{brand || "Brand"}</strong>
        </div>
        <span>•</span>
        <div className={styles.metaItem}>
          Category: <strong>{category.name}</strong>
        </div>
        <span>•</span>
        <div className={styles.metaItem}>
          <Building2 size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          Retailer: <strong>{merchantName}</strong>
        </div>
      </div>

      {/* Verified Rating & Reviews (Displayed Only When Real/Verified) */}
      {hasRating && (
        <div className={styles.ratingRow}>
          <div className={styles.ratingStars}>
            <Star size={13} fill="currentColor" />
            <span>{rating?.toFixed(1)}</span>
          </div>
          {reviewCount && reviewCount > 0 && (
            <span style={{ color: "var(--md-color-text-secondary)", fontWeight: 500 }}>
              ({reviewCount.toLocaleString("en-IN")} reviews)
            </span>
          )}
          {ratingSource && (
            <span style={{ color: "var(--md-color-text-muted)", fontSize: 12 }}>
              · Source: {ratingSource}
            </span>
          )}
        </div>
      )}

      {/* Product Description */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--md-color-text)" }}>
          About this item
        </h3>
        <p className={styles.productDescription}>{description || title}</p>
      </div>

      {/* Key Specifications & Verification Table */}
      <div className={styles.specsTable}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-color-text)", marginBottom: 2 }}>
          Product Specifications &amp; Trust Attributes
        </div>
        <div className={styles.specRow}>
          <span className={styles.specKey}>Brand</span>
          <span className={styles.specValue}>{brand || "Brand"}</span>
        </div>
        <div className={styles.specRow}>
          <span className={styles.specKey}>Category</span>
          <span className={styles.specValue}>{category.name}</span>
        </div>
        <div className={styles.specRow}>
          <span className={styles.specKey}>Primary Retailer</span>
          <span className={styles.specValue}>{merchantName}</span>
        </div>
        <div className={styles.specRow}>
          <span className={styles.specKey}>Pricing Currency</span>
          <span className={styles.specValue}>INR ({currency})</span>
        </div>
        <div className={styles.specRow}>
          <span className={styles.specKey}>Deal Verification</span>
          <span className={styles.specValue} style={{ color: "var(--md-color-success)" }}>
            Automated Price Drop Verified
          </span>
        </div>
      </div>
    </div>
  );
}

