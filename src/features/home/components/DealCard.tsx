"use client";

import { trackEvent } from "@/lib/analytics-client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Heart,
  Star,
  Tag,
  Copy,
  Check,
  ExternalLink,
  Eye,
  ThumbsUp,
  Share2,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { formatINR, getSavings } from "@/features/deals/pricing";
import { StoreLogo } from "./StoreLogo";
import dynamic from "next/dynamic";
const DealCommentsDialog = dynamic(() => import("@/components/deals/DealCommentsDialog").then((m) => m.DealCommentsDialog));

function formatPostedDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return "New";
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatCompactNumber(num: number): string {
  if (num >= 10000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return num.toString();
}

export function DealCard({
  deal,
  saved,
  onSave,
  onView,
}: {
  deal: Deal;
  saved: boolean;
  onSave: (id: string) => void;
  onView: (deal: Deal) => void;
}) {
  const savings = getSavings(deal.originalPrice, deal.price);
  const galleryImages = useMemo(
    () => [...new Set([deal.image, ...(deal.imageGallery ?? [])].filter(Boolean))],
    [deal.image, deal.imageGallery],
  );
  const cardRef = useRef<HTMLElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [copiedCoupon, setCopiedCoupon] = useState(false);
  // No number is shown: there is no stored like count, and a made-up one would misstate popularity.
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { rootMargin: "150px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !isNearViewport ||
      galleryImages.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setImageIndex((current) => (current + 1) % galleryImages.length);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [galleryImages, isNearViewport]);

  function selectGalleryImage(direction: -1 | 1) {
    setImageIndex((current) => (current + direction + galleryImages.length) % galleryImages.length);
  }

  const currentImageIndex = imageIndex % Math.max(1, galleryImages.length);
  const currentImage = galleryImages[currentImageIndex] || "/images/placeholder.svg";
  const imageSrc = failedImage === currentImage ? "/images/placeholder.svg" : currentImage;

  const postedDate = formatPostedDate(deal.publishedAt);
  const viewCount = deal.viewCount && deal.viewCount > 0 ? deal.viewCount : 0;
  const [shareCount, setShareCount] = useState<number>(deal.shareCount || 0);
  const [copiedShare, setCopiedShare] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const handleCopyCoupon = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code);
    trackEvent("COUPON_COPY", deal.slug || deal.id);
    setCopiedCoupon(true);
    setTimeout(() => setCopiedCoupon(false), 2000);
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!liked) trackEvent("LIKE", deal.slug || deal.id);
    setLiked((prev) => !prev);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== "undefined" ? `${window.location.origin}/deal/${deal.slug || deal.id}` : "";
    if (url) {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);

      trackEvent("SHARE", deal.slug || deal.id);
      // Increment share count
      setShareCount((prev) => prev + 1);
      fetch(`/api/v1/deals/${encodeURIComponent(deal.slug || deal.id)}/share`, {
        method: "POST",
      }).catch(() => {});
    }
  };

  return (
    <>
    <article
      ref={cardRef}
      className="deal-card"
      aria-labelledby={`title-${deal.id}`}
      onClick={() => { trackEvent("MODAL_OPEN", deal.slug || deal.id); onView(deal); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(deal);
        }
      }}
    >
      {/* ROW 1: Product Image, Discount Badge, Wishlist Icon */}
      <div className="deal-image-wrap">
        <span className="discount-badge">{savings.percent}% OFF</span>
        <button
          type="button"
          className={`save-deal ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${deal.name}`}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation();
            onSave(deal.id);
          }}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
        <div className="product-image-button" aria-label={`Preview ${deal.name}`}>
          <Image
            key={`${deal.id}-${currentImageIndex}`}
            src={imageSrc.startsWith("/api/v1/media/") && !imageSrc.includes("?") ? `${imageSrc}?w=640` : imageSrc}
            alt=""
            aria-hidden="true"
            className="deal-gallery-image"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 20vw"
            onError={() => setFailedImage(currentImage)}
            unoptimized
          />
        </div>
        {deal.expiry === "expired" && (
          <div className="deal-expired-overlay" aria-label="This deal has expired">
            <span>Expired</span>
          </div>
        )}
        {galleryImages.length > 1 && (
          <div className="deal-gallery-controls" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label={`Previous photo for ${deal.name}`} onClick={() => selectGalleryImage(-1)}><ChevronLeft size={18} /></button>
            <button type="button" aria-label={`Next photo for ${deal.name}`} onClick={() => selectGalleryImage(1)}><ChevronRight size={18} /></button>
          </div>
        )}
      </div>

      <div className="deal-details">
        {/* ROW 2: Product Title (Max 2 lines) */}
        <h3 id={`title-${deal.id}`} className="deal-row-title" title={deal.name}>
          {deal.name}
        </h3>

        {/* ROW 3: Price, MRP, Savings Badge & Star Rating */}
        <div className="deal-row-price">
          <div className="deal-price-col">
            <div className="deal-price-numbers">
              <strong>{formatINR(Math.round(deal.price), { decimals: "never" })}</strong>
              {deal.originalPrice > 0 && (
                <del>{formatINR(Math.round(deal.originalPrice), { decimals: "never" })}</del>
              )}
            </div>

            <div className="deal-savings-row">
              {savings.amount > 0 && (
                <span className="savings">
                  Save {formatINR(Math.round(savings.amount), { decimals: "never" })}
                </span>
              )}
            </div>
          </div>

          {deal.rating != null && deal.rating > 0 && (
            <div
              className="deal-rating-col"
              title={`${deal.rating} out of 5 stars`}
              aria-label={`Rated ${deal.rating} out of 5 stars`}
            >
              <span className="deal-rating-score">
                {Number(deal.rating) % 1 === 0 && Number(deal.rating) === 4
                  ? "4"
                  : Number(deal.rating).toFixed(1)}
              </span>
              <div className="deal-rating-stars" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((pos) => {
                  const isFilled = pos <= Math.floor(deal.rating!);
                  return (
                    <Star
                      key={pos}
                      size={11}
                      className={isFilled ? "deal-star-filled" : "deal-star-empty"}
                      fill={isFilled ? "currentColor" : "none"}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ROW 4: Retailer & Posted Date */}
        <div className="deal-row-retailer">
          <StoreLogo store={deal.store} name={deal.storeName} logoUrl={deal.storeLogoUrl} logoOnly />
          {postedDate && <span className="deal-posted-date">{postedDate}</span>}
        </div>

        {/* ROW 5: Coupon Row (Code + copy action OR aligned empty placeholder) */}
        <div className="deal-row-coupon">
          {deal.couponCode ? (
            <div className="deal-coupon-pill">
              <span className="deal-coupon-code">
                <Tag size={12} /> Coupon: {deal.couponCode}
              </span>
              <button
                type="button"
                className="deal-coupon-copy"
                onClick={(e) => handleCopyCoupon(e, deal.couponCode!)}
                title="Copy coupon code"
              >
                {copiedCoupon ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCoupon ? "Copied" : "Copy"}</span>
              </button>
            </div>
          ) : (
            <div className="deal-coupon-placeholder" aria-hidden="true" />
          )}
        </div>

        {/* ROW 6: Action Row (Post Details & Buy Now) */}
        <div className="deal-row-actions">
          <a
            href={`/deal/${encodeURIComponent(deal.slug || deal.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="deal-view-details-btn"
            aria-label={`View deal details for ${deal.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            Post Details
          </a>
          {deal.expiry === "expired" ? (
            <span className="deal-buy-now-disabled" aria-label={`Offer expired for ${deal.name}`}>Expired</span>
          ) : (
            <a
              href={`/go/${deal.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="deal-buy-now-btn"
              aria-label={`Buy ${deal.name} now`}
              onClick={(e) => e.stopPropagation()}
            >
              Buy Now <ExternalLink size={12} />
            </a>
          )}
        </div>

        {/* ROW 7: Social Interaction Row (Views, Like, Share, Comment) */}
        <div className="deal-row-social">
          <div className="deal-social-views" title={`${viewCount} views`}>
            <Eye size={13} />
            <span>{formatCompactNumber(viewCount)}</span>
          </div>

          <button
            type="button"
            className={`deal-social-btn ${liked ? "deal-social-liked" : ""}`}
            onClick={handleToggleLike}
            title="Like deal"
          >
            <ThumbsUp size={13} fill={liked ? "currentColor" : "none"} />
            <span>{liked ? "Liked" : "Like"}</span>
          </button>

          <button
            type="button"
            className="deal-social-btn"
            onClick={handleShare}
            title={copiedShare ? "Link copied to clipboard!" : "Share deal"}
          >
            <Share2 size={13} />
            <span>{copiedShare ? "Copied" : shareCount > 0 ? formatCompactNumber(shareCount) : "Share"}</span>
          </button>

          <button
            type="button"
            className="deal-social-btn"
            onClick={(e) => {
              e.stopPropagation();
              trackEvent("COMMENT", deal.slug || deal.id);
              setCommentsOpen(true);
            }}
            aria-label={`View comments for ${deal.name}`}
            title="View comments"
          >
            <MessageCircle size={13} />
            <span>Comment</span>
          </button>
        </div>
      </div>
    </article>
    {commentsOpen && (
      <DealCommentsDialog
        dealIdOrSlug={deal.slug || deal.id}
        dealTitle={deal.name}
        onClose={() => setCommentsOpen(false)}
      />
    )}
    </>
  );
}
