"use client";

import { useState } from "react";
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
  Monitor,
  Tablet,
  Smartphone,
  Sliders,
  UserCheck,
  UserX,
} from "lucide-react";
import { formatINR } from "@/features/deals/pricing";
import styles from "./prototype.module.css";

interface SampleDeal {
  id: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  rating: number;
  reviewCount: number;
  merchantName: string;
  postedDate: string;
  couponCode?: string;
  initialViews: number;
  initialLikes: number;
  initialComments: number;
}

const SAMPLE_DEALS: SampleDeal[] = [
  {
    id: "sample-1",
    name: "Ponmani Power Plus - 3 litres Tilting Wet Grinder | Black | 225W Motor",
    brand: "Ponmani",
    image: "https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=500&auto=format&fit=crop&q=80",
    price: 8782,
    originalPrice: 11840,
    discountPercent: 26,
    rating: 4.2,
    reviewCount: 816,
    merchantName: "Amazon India",
    postedDate: "Just now",
    couponCode: "GRIND5",
    initialViews: 1240,
    initialLikes: 124,
    initialComments: 18,
  },
  {
    id: "sample-2",
    name: "Spigen Liquid Air Back Cover for Apple iPhone 14 Plus (Matte Black)",
    brand: "Spigen",
    image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=500&auto=format&fit=crop&q=80",
    price: 359,
    originalPrice: 413,
    discountPercent: 13,
    rating: 4.4,
    reviewCount: 3240,
    merchantName: "Flipkart",
    postedDate: "Just now",
    couponCode: "SPIGEN10",
    initialViews: 2890,
    initialLikes: 286,
    initialComments: 42,
  },
  {
    id: "sample-3",
    name: "Samsung Galaxy S25 5G Snapdragon (Icyblue, 128 GB Storage, 8GB RAM)",
    brand: "Samsung",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80",
    price: 54999,
    originalPrice: 63249,
    discountPercent: 13,
    rating: 4.6,
    reviewCount: 1420,
    merchantName: "Flipkart",
    postedDate: "1d ago",
    // No coupon intentionally to demonstrate equal card height alignment
    couponCode: undefined,
    initialViews: 15400,
    initialLikes: 512,
    initialComments: 76,
  },
  {
    id: "sample-4",
    name: "Samsung Galaxy A36 5G (Dark Green, 128 GB) 50MP OIS Camera",
    brand: "Samsung",
    image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=500&auto=format&fit=crop&q=80",
    price: 24999,
    originalPrice: 28749,
    discountPercent: 13,
    rating: 4.4,
    reviewCount: 890,
    merchantName: "Flipkart",
    postedDate: "1d ago",
    couponCode: "A36DEAL",
    initialViews: 4200,
    initialLikes: 198,
    initialComments: 34,
  },
  {
    id: "sample-5",
    name: "PHILIPS 1000 Series 6.2L 1700 Watt Digital Air Fryer with Rapid Air Tech",
    brand: "Philips",
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=500&auto=format&fit=crop&q=80",
    price: 8990,
    originalPrice: 9999,
    discountPercent: 10,
    rating: 4.5,
    reviewCount: 520,
    merchantName: "Croma",
    postedDate: "2d ago",
    // No coupon intentionally
    couponCode: undefined,
    initialViews: 980,
    initialLikes: 89,
    initialComments: 12,
  },
];

function formatCompactNumber(num: number): string {
  if (num >= 10000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return num.toString();
}

export default function PrototypeDealCardsPage() {
  const [viewMode, setViewMode] = useState<"desktop" | "tablet" | "mobile" | "responsive">("desktop");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [wishlistedIds, setWishlistedIds] = useState<Record<string, boolean>>({});
  const [copiedCouponId, setCopiedCouponId] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; active: boolean }>>({
    "sample-1": { count: 124, active: false },
    "sample-2": { count: 286, active: false },
    "sample-3": { count: 512, active: false },
    "sample-4": { count: 198, active: false },
    "sample-5": { count: 89, active: false },
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2500);
  };

  const toggleWishlist = (id: string) => {
    setWishlistedIds((prev) => {
      const next = !prev[id];
      showToast(next ? "Added to wishlist" : "Removed from wishlist");
      return { ...prev, [id]: next };
    });
  };

  const copyCoupon = (id: string, code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCouponId(id);
    showToast(`Coupon code "${code}" copied to clipboard!`);
    setTimeout(() => {
      setCopiedCouponId((cur) => (cur === id ? null : cur));
    }, 2000);
  };

  const toggleLike = (id: string) => {
    setLikes((prev) => {
      const current = prev[id] || { count: 0, active: false };
      const nextActive = !current.active;
      const nextCount = nextActive ? current.count + 1 : Math.max(0, current.count - 1);
      showToast(nextActive ? "Deal liked!" : "Like removed");
      return {
        ...prev,
        [id]: { count: nextCount, active: nextActive },
      };
    });
  };

  const handleShare = (deal: SampleDeal) => {
    showToast(`Link for "${deal.name.slice(0, 30)}..." copied to share!`);
  };

  const handleComment = (deal: SampleDeal) => {
    showToast(`Comments prototype clicked for "${deal.name.slice(0, 30)}..."`);
  };

  const handlePostDetails = (deal: SampleDeal) => {
    showToast(`Opening post details modal for "${deal.name.slice(0, 30)}..."`);
  };

  return (
    <div className={styles.prototypeContainer}>
      {/* Top Toolbar */}
      <header className={styles.topToolbar}>
        <div className={styles.toolbarTitle}>
          <h1>Deal Card Redesign Prototype</h1>
          <span className={styles.badge}>Preview Mode</span>
        </div>

        <div className={styles.controlsGroup}>
          {/* Viewport Modes */}
          <div className={styles.controlSection}>
            <span className={styles.controlLabel}>Viewport:</span>
            <div className={styles.toggleButtonGroup}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === "desktop" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("desktop")}
                title="Desktop View (5 cards per row)"
              >
                <Monitor size={15} /> Desktop (5)
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === "tablet" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("tablet")}
                title="Tablet View (2 cards per row)"
              >
                <Tablet size={15} /> Tablet (2)
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === "mobile" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("mobile")}
                title="Mobile View (1 card per row)"
              >
                <Smartphone size={15} /> Mobile (1)
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === "responsive" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("responsive")}
                title="Auto Responsive Grid"
              >
                <Sliders size={15} /> Auto
              </button>
            </div>
          </div>

          {/* Authentication State */}
          <div className={styles.controlSection}>
            <span className={styles.controlLabel}>Auth State:</span>
            <div className={styles.toggleButtonGroup}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${isLoggedIn ? styles.toggleBtnActive : ""}`}
                onClick={() => setIsLoggedIn(true)}
              >
                <UserCheck size={15} /> Logged In
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${!isLoggedIn ? styles.toggleBtnActive : ""}`}
                onClick={() => setIsLoggedIn(false)}
              >
                <UserX size={15} /> Logged Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className={styles.previewCanvasWrapper}>
        <div
          className={`${styles.viewportFrame} ${
            viewMode === "desktop"
              ? styles.modeDesktop
              : viewMode === "tablet"
              ? styles.modeTablet
              : viewMode === "mobile"
              ? styles.modeMobile
              : styles.modeResponsive
          }`}
        >
          <div className={styles.sectionHeader}>
            <h2>
              <span>⚡</span> Today&apos;s Top Deals
            </h2>
            <p>
              Handpicked deals with the biggest savings for you • Grid layout:{" "}
              {viewMode === "desktop"
                ? "5 per row (Desktop)"
                : viewMode === "tablet"
                ? "2 per row (Tablet)"
                : viewMode === "mobile"
                ? "1 per row (Mobile Full Width)"
                : "Responsive Auto"}
              {isLoggedIn ? " • Social engagement active (Logged in)" : " • Social row hidden (Logged out)"}
            </p>
          </div>

          {/* Responsive Deals Grid */}
          <div className={styles.dealsGrid}>
            {SAMPLE_DEALS.map((deal) => {
              const savingsAmount = Math.max(0, deal.originalPrice - deal.price);
              const isWishlisted = !!wishlistedIds[deal.id];
              const likeState = likes[deal.id] || { count: deal.initialLikes, active: false };

              return (
                <article key={deal.id} className={styles.dealCard}>
                  {/* ROW 1: Product Image, Discount Badge, Wishlist Icon */}
                  <div className={styles.rowImage}>
                    <span className={styles.discountBadge}>{deal.discountPercent}% OFF</span>

                    <button
                      type="button"
                      className={`${styles.wishlistBtn} ${isWishlisted ? styles.wishlistBtnActive : ""}`}
                      onClick={() => toggleWishlist(deal.id)}
                      aria-label={isWishlisted ? "Remove from wishlist" : "Save to wishlist"}
                    >
                      <Heart size={16} fill={isWishlisted ? "currentColor" : "none"} />
                    </button>

                    <div className={styles.imgWrapper}>
                      <Image
                        src={deal.image}
                        alt={deal.name}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 20vw"
                        className={styles.productImg}
                        unoptimized
                      />
                    </div>
                  </div>

                  <div className={styles.cardContent}>
                    {/* ROW 2: Product Title (Max 2 lines) */}
                    <h3 className={styles.rowTitle} title={deal.name}>
                      {deal.name}
                    </h3>

                    {/* ROW 3: Price, MRP, Savings Badge & Star Rating */}
                    <div className={styles.rowPricing}>
                      <div className={styles.priceBlock}>
                        <div className={styles.priceLine}>
                          <span className={styles.dealPrice}>
                            {formatINR(Math.round(deal.price), { decimals: "never" })}
                          </span>
                          {deal.originalPrice > 0 && (
                            <span className={styles.originalMrp}>
                              {formatINR(Math.round(deal.originalPrice), { decimals: "never" })}
                            </span>
                          )}
                        </div>

                        {savingsAmount > 0 && (
                          <span className={styles.savingsBadge}>
                            Save {formatINR(Math.round(savingsAmount), { decimals: "never" })}
                          </span>
                        )}
                      </div>

                      {deal.rating > 0 && (
                        <div className={styles.ratingBlock} title={`${deal.rating} out of 5 stars`}>
                          <span className={styles.ratingScore}>{deal.rating.toFixed(1)}</span>
                          <div className={styles.starsRow} aria-hidden="true">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                size={11}
                                className={
                                  star <= Math.floor(deal.rating)
                                    ? styles.starGolden
                                    : styles.starGray
                                }
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ROW 4: Merchant Branding & Posted Date */}
                    <div className={styles.rowMerchant}>
                      <span className={styles.merchantName}>{deal.merchantName}</span>
                      <span className={styles.postedDate}>{deal.postedDate}</span>
                    </div>

                    {/* ROW 5: Coupon Row (Displays code + copy action OR placeholder) */}
                    <div className={styles.rowCoupon}>
                      {deal.couponCode ? (
                        <div className={styles.couponPill}>
                          <span className={styles.couponCode}>
                            <Tag size={12} /> Coupon: {deal.couponCode}
                          </span>
                          <button
                            type="button"
                            className={styles.couponCopyBtn}
                            onClick={() => copyCoupon(deal.id, deal.couponCode!)}
                            title="Copy coupon code"
                          >
                            {copiedCouponId === deal.id ? (
                              <>
                                <Check size={12} /> Copied
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className={styles.couponEmptyPlaceholder} aria-hidden="true" />
                      )}
                    </div>

                    {/* ROW 6: Action Row (Post Details & Buy Now) */}
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.detailsBtn}
                        onClick={() => handlePostDetails(deal)}
                      >
                        Post Details
                      </button>

                      <a
                        href={`#buy-${deal.id}`}
                        className={styles.buyNowBtn}
                        onClick={(e) => {
                          e.preventDefault();
                          showToast(`Affiliate redirection simulated for "${deal.merchantName}"`);
                        }}
                      >
                        Buy Now <ExternalLink size={12} />
                      </a>
                    </div>

                    {/* ROW 7: Social Interaction Row (Views, Like, Share, Comment) */}
                    {isLoggedIn && (
                      <div className={styles.rowSocial}>
                        <div className={styles.viewsItem} title={`${deal.initialViews} Total views`}>
                          <Eye size={13} />
                          <span>{formatCompactNumber(deal.initialViews)}</span>
                        </div>

                        <button
                          type="button"
                          className={`${styles.socialBtn} ${likeState.active ? styles.socialLiked : ""}`}
                          onClick={() => toggleLike(deal.id)}
                          title="Like deal"
                        >
                          <ThumbsUp size={13} fill={likeState.active ? "currentColor" : "none"} />
                          <span>{formatCompactNumber(likeState.count)}</span>
                        </button>

                        <button
                          type="button"
                          className={styles.socialBtn}
                          onClick={() => handleShare(deal)}
                          title="Share deal"
                        >
                          <Share2 size={13} />
                          <span>Share</span>
                        </button>

                        <button
                          type="button"
                          className={styles.socialBtn}
                          onClick={() => handleComment(deal)}
                          title="View comments"
                        >
                          <MessageCircle size={13} />
                          <span>{formatCompactNumber(deal.initialComments)}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>

      {/* Toast Feedback */}
      {toastMessage && <div className={styles.toastNotification}>{toastMessage}</div>}
    </div>
  );
}

