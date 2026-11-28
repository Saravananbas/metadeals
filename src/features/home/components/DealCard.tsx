"use client";

import { trackEvent } from "@/lib/analytics-client";
import { publicDealUrl } from "@/features/deals/share-card/message";
import { ShareDealModal } from "@/components/deals/ShareDealModal";
import type { ShareDealData } from "@/features/deals/share-card/types";
import { sendDealVote } from "@/features/deals/vote-client";
import type { DislikeReason } from "@/features/deals/vote-reasons";
import { DislikeMenu } from "@/components/deals/DislikeMenu";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Heart,
  Star,
  Tag,
  Copy,
  Check,
  ExternalLink,
  FileText,
  ShoppingCart,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Share2,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { formatINR, getSavings } from "@/features/deals/pricing";
import { StoreLogo } from "./StoreLogo";
import { BankLogo } from "@/components/deals/BankLogo";
import { bestOffer, offerHeadline } from "@/features/deals/bank-offers";
import { OfferPopover } from "./OfferPopover";
import { dealHref } from "@/features/deals/seo-url";

const CARD_WIDTHS = [240, 320, 400, 480, 640];

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

/** On a phone the details and comments open in the same page; on larger screens they keep opening in a new tab. */
const sameTabOnPhone = (e: { currentTarget: HTMLAnchorElement }) => { if (window.matchMedia("(max-width: 639px)").matches) e.currentTarget.target = "_self"; };

export function DealCard({
  deal,
  saved,
  onSave,
  onView,
  priority = false,
}: {
  deal: Deal;
  saved: boolean;
  onSave: (id: string) => void;
  onView: (deal: Deal) => void;
  /** The first card is usually the largest contentful paint: load it first instead of lazily. */
  priority?: boolean;
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
  // Members' Good Deal vote (1 up, -1 down). No count is shown on the card; the score is on the deal page.
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const [voteNote, setVoteNote] = useState("");
  const [likes, setLikes] = useState<number>(deal.likeCount ?? 0);

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
  const isMediaImage = imageSrc.startsWith("/api/v1/media/") && !imageSrc.includes("?");

  const postedDate = formatPostedDate(deal.publishedAt);
  const viewCount = deal.viewCount && deal.viewCount > 0 ? deal.viewCount : 0;
  // A coupon keeps the card's offer row; otherwise the best bank offer for this price is shown there.
  const bank = bestOffer(deal.bankOffers, Math.round(deal.price * 100));
  const shownOffer = bank?.offer ?? deal.bankOffers?.[0];
  // One item fits on the card; a "+N" opens the rest (coupon and every bank offer) in a pop-up on hover, focus or tap.
  const moreOffers = (deal.couponCode ? 1 : 0) + (deal.bankOffers?.length ?? 0) - 1;
  const offerRowRef = useRef<HTMLDivElement>(null);
  const [offerAnchor, setOfferAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOffers = () => { if (closeTimer.current) clearTimeout(closeTimer.current); if (offerRowRef.current) setOfferAnchor(offerRowRef.current.getBoundingClientRect()); };
  const closeOffers = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOfferAnchor(null), 150); };
  useEffect(() => {
    if (!offerAnchor) return;
    const close = () => setOfferAnchor(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, true); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", key); };
  }, [offerAnchor]);
  const [shareCount, setShareCount] = useState<number>(deal.shareCount || 0);

  const handleCopyCoupon = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code);
    trackEvent("COUPON_COPY", deal.slug || deal.id);
    setCopiedCoupon(true);
    setTimeout(() => setCopiedCoupon(false), 2000);
  };

  const castVote = async (value: 1 | -1 | 0, reason?: DislikeReason, clear?: 1 | -1) => {
    setDislikeOpen(false);
    const result = await sendDealVote(deal.slug || deal.id, value, reason, clear);
    if (result.status === 401) { setVoteNote("Sign in to vote"); setTimeout(() => setVoteNote(""), 3000); return; }
    if (result.status === 200) setLikes(result.up ?? likes);
    if (result.status === 200) { setLiked(Boolean(result.liked)); setDisliked(Boolean(result.disliked)); }
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!liked) trackEvent("LIKE", deal.slug || deal.id);
    void (liked ? castVote(0, undefined, 1) : castVote(1));
  };

  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disliked) void castVote(0, undefined, -1);
    else setDislikeOpen((open) => !open);
  };

  const [shareOpen, setShareOpen] = useState(false);
  const shareData = (): ShareDealData => ({
    slug: deal.slug || deal.id, title: deal.name, priceMinor: Math.round(deal.price * 100), mrpMinor: Math.round(deal.originalPrice * 100),
    storeName: deal.storeName ?? null, couponCode: deal.couponCode ?? null, bankOffers: deal.bankOffers ?? [],
    images: [deal.image, ...(deal.imageGallery ?? [])].filter(Boolean), expired: deal.expiry === "expired",
    brand: deal.brand, categoryName: deal.category.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), description: deal.description ?? null,
  });
  const countShare = () => {
    trackEvent("SHARE", deal.slug || deal.id);
    setShareCount((prev) => prev + 1);
    fetch(`/api/v1/deals/${encodeURIComponent(deal.slug || deal.id)}/share`, { method: "POST" }).catch(() => {});
  };
  const handleShare = (e: React.MouseEvent) => { e.stopPropagation(); setShareOpen(true); };

  return (
    <>
    {shareOpen && <ShareDealModal deal={shareData()} url={publicDealUrl(window.location.origin, deal)} onShared={countShare} onClose={() => setShareOpen(false)} />}
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
          {isMediaImage ? (
            // Our own images come in several widths (see the media API); the browser picks the smallest one that is sharp enough for the card.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${deal.id}-${currentImageIndex}`}
              src={`${imageSrc}?w=640`}
              srcSet={CARD_WIDTHS.map((w) => `${imageSrc}?w=${w} ${w}w`).join(", ")}
              sizes="(max-width: 639px) 34vw, (max-width: 1199px) 50vw, 16vw"
              alt=""
              aria-hidden="true"
              className="deal-gallery-image"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", color: "transparent" }}
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              onError={() => setFailedImage(currentImage)}
            />
          ) : (
            <Image
              key={`${deal.id}-${currentImageIndex}`}
              src={imageSrc}
              alt=""
              aria-hidden="true"
              className="deal-gallery-image"
              fill
              loading={priority ? "eager" : undefined}
              fetchPriority={priority ? "high" : undefined}
              sizes="(max-width: 639px) 34vw, (max-width: 1199px) 50vw, 16vw"
              onError={() => setFailedImage(currentImage)}
              unoptimized
            />
          )}
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
          {postedDate && <span className="deal-posted-date" suppressHydrationWarning>{postedDate}</span>}
        </div>

        {/* ROW 5: Coupon Row (Code + copy action OR aligned empty placeholder) */}
        <div className="deal-row-coupon" ref={offerRowRef} onMouseEnter={moreOffers > 0 ? openOffers : undefined} onMouseLeave={moreOffers > 0 ? closeOffers : undefined}>
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
          ) : shownOffer ? (
            <div className="deal-bank-pill" title={`${offerHeadline(shownOffer)} with ${shownOffer.bankName}`}>
              <BankLogo name={shownOffer.bankName} logoUrl={shownOffer.bankLogoUrl} size={18} />
              <span>{offerHeadline(shownOffer)} · {shownOffer.bankName}</span>
            </div>
          ) : (
            <div className="deal-coupon-placeholder" aria-hidden="true" />
          )}
          {moreOffers > 0 && (
            <button type="button" className="deal-offer-more" aria-haspopup="dialog" aria-expanded={Boolean(offerAnchor)} aria-label={`Show ${moreOffers} more offer${moreOffers === 1 ? "" : "s"}`}
              onClick={(e) => { e.stopPropagation(); if (offerAnchor) setOfferAnchor(null); else openOffers(); }} onFocus={openOffers}>
              +{moreOffers}
            </button>
          )}
          {offerAnchor && <OfferPopover anchor={offerAnchor} coupon={deal.couponCode ?? null} offers={deal.bankOffers ?? []} copied={copiedCoupon} onCopy={handleCopyCoupon} onEnter={openOffers} onLeave={closeOffers} />}
        </div>

        {/* ROW 6: Action Row (Details & Buy Now) */}
        <div className="deal-row-actions">
          <a
            href={dealHref(deal)}
            target="_blank"
            rel="noopener noreferrer"
            className="deal-view-details-btn"
            aria-label={`View deal details for ${deal.name}`}
            onClick={(e) => { sameTabOnPhone(e); e.stopPropagation(); }}
          >
            <FileText size={16} aria-hidden="true" /> Details
          </a>
          <a
            href={`/go/${deal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="deal-buy-now-btn"
            aria-label={`Buy ${deal.name} now`}
            onClick={(e) => e.stopPropagation()}
          >
            <ShoppingCart size={16} aria-hidden="true" /> Buy Now <span className="deal-btn-divider" aria-hidden="true" /> <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>

        {/* ROW 7: Social Interaction Row (Views, Like, Share, Comment) */}
        <div className="deal-row-social">
          <div className="deal-social-views" title={`${viewCount} views`}>
            <Eye size={13} />
            <span>{formatCompactNumber(viewCount)}</span>
          </div>

          <button
            type="button"
            className={`deal-social-btn deal-social-like ${liked ? "deal-social-liked" : ""}`}
            onClick={handleToggleLike}
            aria-pressed={liked}
            aria-label={`${liked ? "Remove your like" : "Like this deal"}${likes ? `, ${likes} likes` : ""}`}
            title={liked ? "Remove your like" : "Like deal"}
          >
            <ThumbsUp size={13} fill={liked ? "currentColor" : "none"} />
            {likes > 0 && <span>{formatCompactNumber(likes)}</span>}
          </button>

          <span style={{ position: "relative", display: "inline-flex" }}>
            <button
              type="button"
              className={`deal-social-btn deal-social-dislike ${disliked ? "deal-social-liked" : ""}`}
              onClick={handleDislike}
              aria-haspopup="true"
              aria-expanded={dislikeOpen}
              aria-label={disliked ? "Remove your downvote" : "Downvote this deal"}
              title="Dislike deal"
            >
              <ThumbsDown size={13} fill={disliked ? "currentColor" : "none"} />
            </button>
            {dislikeOpen && <DislikeMenu onPick={(reason) => void castVote(-1, reason)} onClose={() => setDislikeOpen(false)} />}
          </span>

          <button
            type="button"
            className="deal-social-btn deal-social-share"
            onClick={handleShare}
            aria-label={`Share this deal${shareCount ? `, shared ${shareCount} times` : ""}`}
            title="Share deal"
          >
            <Share2 size={13} />
            {shareCount > 0 && <span>{formatCompactNumber(shareCount)}</span>}
          </button>

          <a
            className="deal-social-btn deal-social-comment"
            href={`${dealHref(deal)}#comments`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { sameTabOnPhone(e); e.stopPropagation(); trackEvent("COMMENT", deal.slug || deal.id); }}
            aria-label={`Open the comments for ${deal.name} in a new tab${deal.commentCount ? ` (${deal.commentCount})` : ""}`}
            title={deal.commentCount ? `${deal.commentCount} comment${deal.commentCount === 1 ? "" : "s"}` : "Comments"}
          >
            <MessageCircle size={13} />
            {deal.commentCount ? <span>{formatCompactNumber(deal.commentCount)}</span> : null}
          </a>
        </div>
        {voteNote && <p role="status" style={{ margin: "6px 0 0", fontSize: 12, color: "var(--md-color-text-secondary)" }}>{voteNote} — <a href="/account" style={{ color: "var(--md-purple-700)", fontWeight: 700 }}>Sign in</a></p>}
      </div>
    </article>
    </>
  );
}
