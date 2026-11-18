"use client";
import { dealShareUrl } from "@/features/deals/short-link";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  X,
  Heart,
  Star,
  Clock3,
  CheckCircle2,
  Check,
  Copy,
  ShoppingCart,
  ArrowUpRight,
  ArrowRight,
  Share2,
} from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { formatINR, getSavings } from "@/features/deals/pricing";
import { StoreLogo } from "@/features/home/components/StoreLogo";
import { sampleDeals } from "@/features/deals/sample-catalog";
import { YouTubeReviewsSection } from "@/components/deals/YouTubeReviewsSection";
import type { YouTubeReviewItem } from "@/server/youtube/reviews-service";
import styles from "./deal-details-modal.module.css";

export type DealDetailsModalProps = {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
  saved: boolean;
  onSave: (id: string) => void;
  onSelectDeal?: (deal: Deal) => void;
};

type EnrichedDealData = {
  description?: string;
  options?: Array<{
    id: string;
    merchant: string;
    priceMinor: number;
    destinationUrl: string;
    isAffiliate: boolean;
  }>;
  relatedDeals?: Deal[];
};

export function DealDetailsModal({
  deal,
  isOpen,
  onClose,
  saved,
  onSave,
  onSelectDeal,
}: DealDetailsModalProps) {
  const [prevDeal, setPrevDeal] = useState<Deal | null>(deal);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(deal);
  const [enriched, setEnriched] = useState<EnrichedDealData | null>(null);
  const [apiRelatedDeals, setApiRelatedDeals] = useState<Deal[]>([]);
  const [videoReviews, setVideoReviews] = useState<YouTubeReviewItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgSrc, setImgSrc] = useState<string>(deal?.image || "");
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // Sync state during render when deal prop changes (React 19 recommended pattern)
  if (deal !== prevDeal) {
    setPrevDeal(deal);
    setActiveDeal(deal);
    setImgSrc(deal?.image || "");
    setApiRelatedDeals([]);
    setVideoReviews([]);
  }

  const fallbackRelated = useMemo(() => {
    if (!activeDeal) return [];
    return sampleDeals
      .filter(
        (d) =>
          d.category.toLowerCase() === activeDeal.category.toLowerCase() &&
          d.id !== activeDeal.id
      )
      .slice(0, 3);
  }, [activeDeal]);

  const relatedDeals = apiRelatedDeals.length > 0 ? apiRelatedDeals : fallbackRelated;

  // Load enriched data and related deals whenever activeDeal changes
  useEffect(() => {
    if (!isOpen || !activeDeal || activeDeal.source !== "database") return;

    let isMounted = true;
    const loadTimer = setTimeout(() => {
      if (isMounted) setLoadingRelated(true);
    }, 0);

    const identifier = activeDeal.slug || activeDeal.id;
    fetch(`/api/v1/deals/${encodeURIComponent(identifier)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!isMounted || !payload?.data) return;
        const data = payload.data;

        const relatedList: Deal[] = Array.isArray(data.relatedDeals)
          ? data.relatedDeals.map((r: {
              id: string;
              title: string;
              slug: string;
              brand?: string;
              category?: { slug: string; name: string };
              image?: { url: string; alt?: string };
              priceMinor: number;
              mrpMinor: number;
              rating: number | null;
              reviewCount: number | null;
              ratingSource?: string | null;
              merchant?: { slug: string; name: string };
              featured?: boolean;
              publishedAt?: string;
              expiresAt?: string | null;
              description?: string;
            }) => ({
              id: r.id,
              name: r.title,
              slug: r.slug,
              brand: r.brand || "",
              category: r.category?.slug || activeDeal.category,
              image: r.image?.url || activeDeal.image,
              price: r.priceMinor / 100,
              originalPrice: r.mrpMinor / 100,
              rating: r.rating,
              reviewCount: r.reviewCount,
              ratingSource: r.ratingSource,
              store: r.merchant?.slug || "online",
              storeName: r.merchant?.name || "Retailer",
              retailerUrl: `/go/${r.id}`,
              source: "database",
              featured: r.featured || false,
              publishedAt: r.publishedAt || "",
              expiry: r.expiresAt ? "active" : "unknown",
              expiresAt: r.expiresAt,
              description: r.description,
            }))
          : [];

        setEnriched({
          description: data.description || activeDeal.description,
          options: data.options || [],
        });
        setApiRelatedDeals(relatedList.slice(0, 3));
        if (Array.isArray(data.videoReviews)) {
          setVideoReviews(data.videoReviews);
        } else {
          setVideoReviews([]);
        }
      })
      .catch(() => {
        if (isMounted) {
          setApiRelatedDeals([]);
          setVideoReviews([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingRelated(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(loadTimer);
    };
  }, [isOpen, activeDeal]);

  // Lock background scroll when open, restore on close
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !activeDeal) return null;

  const savings = getSavings(activeDeal.originalPrice, activeDeal.price);
  const buyUrl =
    activeDeal.source === "database"
      ? `/go/${activeDeal.id}`
      : activeDeal.retailerUrl || `/go/${activeDeal.id}`;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://metadeals4u.in";
  const canonicalUrl = dealShareUrl(origin, activeDeal); // the short link, used for copy and for the share buttons
  const shareText = `🔥 Great Deal on MetaDeals4U: ${activeDeal.name} for ${formatINR(activeDeal.price)}! Check it out:`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleSelectRelated = (related: Deal) => {
    setActiveDeal(related);
    setImgSrc(related.image);
    setApiRelatedDeals([]);
    setCopied(false);
    onSelectDeal?.(related);
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.modal}>
        {/* Header Bar */}
        <div className={styles.modalHeader}>
          <div className={styles.breadcrumb}>
            <span>Home</span>
            <span>›</span>
            <span className={styles.breadcrumbCategory}>
              {activeDeal.category || "Deals"}
            </span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close deal details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className={styles.modalBody} ref={modalBodyRef}>
          <div className={styles.productGrid}>
            {/* Left Column: Product Image */}
            <div className={styles.leftColumn}>
              <div className={styles.imageContainer}>
                <span className={styles.discountBadge}>
                  {savings.percent}% OFF
                </span>
                <button
                  type="button"
                  className={`${styles.wishlistButton} ${saved ? styles.isSaved : ""}`}
                  aria-label={`${saved ? "Unsave" : "Save"} ${activeDeal.name}`}
                  aria-pressed={saved}
                  onClick={() => onSave(activeDeal.id)}
                >
                  <Heart size={20} fill={saved ? "currentColor" : "none"} />
                </button>
                <Image
                  unoptimized
                  src={imgSrc || "/images/placeholder.svg"}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="(max-width: 768px) 90vw, 420px"
                  className={styles.mainImage}
                  onError={() => setImgSrc("/images/placeholder.svg")}
                  priority
                />
              </div>
            </div>

            {/* Right Column: Pricing & Product Details */}
            <div className={styles.rightColumn}>
              <div className={styles.merchantRow}>
                <StoreLogo
                  store={activeDeal.store}
                  name={activeDeal.storeName}
                />
                {activeDeal.brand && (
                  <span className={styles.brandPill}>
                    Brand: {activeDeal.brand}
                  </span>
                )}
              </div>

              <h2 id="deal-modal-title" className={styles.productTitle}>
                {activeDeal.name}
              </h2>

              {activeDeal.rating !== null && (
                <div className={styles.ratingRow}>
                  <div className={styles.ratingStars}>
                    <Star size={16} fill="currentColor" />
                    <span>{activeDeal.rating}</span>
                  </div>
                  {activeDeal.reviewCount !== null && (
                    <span>
                      ({activeDeal.reviewCount.toLocaleString("en-IN")} reviews)
                    </span>
                  )}
                  {activeDeal.ratingSource && (
                    <span className={styles.ratingSource}>
                      · {activeDeal.ratingSource}
                    </span>
                  )}
                </div>
              )}

              {/* Price Card */}
              <div className={styles.priceCard}>
                <div className={styles.priceLine}>
                  <strong className={styles.dealPrice}>
                    {formatINR(activeDeal.price)}
                  </strong>
                  <del className={styles.mrpPrice}>
                    {formatINR(activeDeal.originalPrice)}
                  </del>
                  <span className={styles.percentOff}>
                    {savings.percent}% OFF
                  </span>
                </div>
                <span className={styles.savingsPill}>
                  Save {formatINR(savings.amount)}
                </span>
              </div>

              <div className={styles.metaInfoRow}>
                <span className={styles.availabilityBadge}>
                  <CheckCircle2 size={15} />
                  <span>In Stock · Verified</span>
                </span>
                {activeDeal.expiresAt && (
                  <span className={styles.expiryBadge}>
                    <Clock3 size={14} />
                    <span>
                      Ends{" "}
                      {new Date(activeDeal.expiresAt).toLocaleDateString(
                        "en-IN",
                        { timeZone: "Asia/Kolkata" }
                      )}
                    </span>
                  </span>
                )}
              </div>

              {/* Prominent Buy Now CTA */}
              <div className={styles.buySection}>
                <a
                  href={buyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.buyButton}
                  aria-label={`Buy ${activeDeal.name} now on ${activeDeal.storeName || "retailer"}`}
                >
                  <ShoppingCart size={20} />
                  <span>🛒 BUY IT NOW</span>
                  <ArrowUpRight size={18} />
                </a>
                <p className={styles.buyDisclaimer}>
                  Direct checkout at verified merchant · Official warranty and returns apply
                </p>
              </div>

              {/* Additional Merchant Options if available */}
              {enriched?.options && enriched.options.length > 0 && (
                <div className={styles.optionsSection}>
                  <div className={styles.optionsTitle}>
                    Also available at other stores:
                  </div>
                  <div className={styles.optionsList}>
                    {enriched.options.map((option) => (
                      <div key={option.id} className={styles.optionRow}>
                        <span>{option.merchant}</span>
                        <span className={styles.optionPrice}>
                          {formatINR(option.priceMinor / 100)}
                        </span>
                        <a
                          href={`/go/${activeDeal.id}?option=${option.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.optionLink}
                        >
                          Buy ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sharing & Social Links */}
              <div className={styles.shareSection}>
                <span className={styles.shareLabel}>
                  <Share2 size={14} style={{ display: "inline", marginRight: 4 }} />
                  Share Deal:
                </span>
                <div className={styles.shareButtons}>
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${canonicalUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.shareBtn} ${styles.shareBtnWhatsApp}`}
                    aria-label="Share deal on WhatsApp"
                  >
                    WhatsApp
                  </a>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.shareBtn} ${styles.shareBtnFacebook}`}
                    aria-label="Share deal on Facebook"
                  >
                    Facebook
                  </a>
                  <a
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(canonicalUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.shareBtn} ${styles.shareBtnX}`}
                    aria-label="Share deal on X"
                  >
                    X
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`${styles.shareBtn} ${styles.shareBtnCopy}`}
                    aria-label="Copy deal link"
                  >
                    {copied ? (
                      <>
                        <Check size={14} />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Product Description */}
          <div className={styles.descriptionSection}>
            <h3 className={styles.sectionHeading}>About This Deal</h3>
            <div className={styles.descriptionBody}>
              {enriched?.description ||
                activeDeal.description ||
                "This deal has been verified from our partner merchant network. Check product specifications and seller details before final checkout."}
            </div>
            <div className={styles.termsNotice}>
              <strong>Notice:</strong> Prices, coupons and bank offers may fluctuate
              rapidly on the merchant website. MetaDeals4U may earn an affiliate
              commission on qualifying purchases made through our links.
            </div>
          </div>

          {/* YouTube Video Reviews Section */}
          {videoReviews.length > 0 && (
            <div style={{ marginTop: 24, marginBottom: 8 }}>
              <YouTubeReviewsSection reviews={videoReviews} />
            </div>
          )}

          {/* Mandatory: 3 Related Deals Section */}
          <div className={styles.relatedSection}>
            <div className={styles.relatedHeader}>
              <h3>You May Also Like</h3>
              <span>Similar top deals in {activeDeal.category || "category"}</span>
            </div>

            {loadingRelated ? (
              <p style={{ color: "var(--md-color-text-muted)", fontSize: 13 }}>
                Loading related offers…
              </p>
            ) : relatedDeals.length > 0 ? (
              <div className={styles.relatedGrid}>
                {relatedDeals.map((rel) => {
                  const relSavings = getSavings(rel.originalPrice, rel.price);
                  return (
                    <article
                      key={rel.id}
                      className={styles.relatedCard}
                      onClick={() => handleSelectRelated(rel)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectRelated(rel);
                        }
                      }}
                    >
                      <div>
                        <div className={styles.relatedImageContainer}>
                          <span className={styles.relatedDiscount}>
                            {relSavings.percent}% OFF
                          </span>
                          <Image
                            unoptimized
                            src={rel.image || "/images/placeholder.png"}
                            alt={rel.name}
                            fill
                            sizes="(max-width: 768px) 200px, 280px"
                            className={styles.relatedImage}
                          />
                        </div>
                        <h4 className={styles.relatedTitle}>{rel.name}</h4>
                        <div className={styles.relatedPriceRow}>
                          <strong className={styles.relatedDealPrice}>
                            {formatINR(rel.price)}
                          </strong>
                          <del className={styles.relatedMrpPrice}>
                            {formatINR(rel.originalPrice)}
                          </del>
                        </div>
                      </div>
                      <div className={styles.relatedBottom}>
                        <StoreLogo store={rel.store} name={rel.storeName} />
                        <button
                          type="button"
                          className={styles.relatedViewButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRelated(rel);
                          }}
                        >
                          View Deal <ArrowRight size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--md-color-text-muted)", fontSize: 13 }}>
                No other offers found in this category right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

