"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, Eye, X } from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";
import type { YouTubeReviewItem } from "@/server/youtube/reviews-service";

function YouTubeIcon({ size = 24, color = "var(--md-color-danger)" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface YouTubeReviewsSectionProps {
  reviews: YouTubeReviewItem[];
}

function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M views`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1)}K views`;
  }
  return `${views} views`;
}

function formatPublishedDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMonths = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (diffMonths < 1) return "Recent review";
    if (diffMonths < 12) return `${diffMonths} mo ago`;
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} yr ago`;
  } catch {
    return "";
  }
}

export function YouTubeReviewsSection({ reviews = [] }: YouTubeReviewsSectionProps) {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  return (
    <section className={styles.videoSection} aria-label="YouTube Product Reviews">
      {/* Section Header */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <YouTubeIcon size={26} color="var(--md-color-danger)" />
          <span>Top Video Reviews from YouTube</span>
        </h2>
        <p className={styles.sectionSubtitle}>
          Watch product reviews in English, Hindi and other languages.
        </p>
      </div>

      {/* Video Cards Grid */}
      {reviews.length > 0 ? (
        <div className={styles.videoGrid}>
          {reviews.slice(0, 3).map((review) => (
            <article key={review.videoId} className={styles.videoCard}>
              {/* Thumbnail Container */}
              <div
                className={styles.videoThumbnailWrap}
                onClick={() => setActiveVideoId(review.videoId)}
                title={`Play review: ${review.title}`}
              >
                <Image
                  unoptimized
                  src={review.thumbnailUrl}
                  alt={review.title}
                  fill
                  style={{ objectFit: "cover" }}
                />

                {/* Language Badge */}
                <span className={styles.langBadge}>{review.language}</span>

                {/* Duration Badge */}
                {review.duration && (
                  <span className={styles.durationBadge}>{review.duration}</span>
                )}

                {/* Play Button Overlay */}
                <div className={styles.playOverlay}>
                  <div className={styles.playCircle}>
                    <Play size={22} fill="currentColor" />
                  </div>
                </div>
              </div>

              {/* Video Info Body */}
              <div className={styles.videoBody}>
                <h3
                  className={styles.videoTitle}
                  onClick={() => setActiveVideoId(review.videoId)}
                  title={review.title}
                >
                  {review.title}
                </h3>

                <div className={styles.channelName}>{review.channelTitle}</div>

                <div className={styles.videoMeta}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Eye size={13} /> {formatViews(review.viewCount)}
                  </span>

                  {review.likeCount && review.likeCount > 0 && (
                    <span>• {review.likeCount.toLocaleString("en-IN")} likes</span>
                  )}

                  {review.publishedAt && (
                    <span>• {formatPublishedDate(review.publishedAt)}</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyReviews}>
          <YouTubeIcon size={36} color="var(--md-color-text-muted)" />
          <p style={{ margin: "10px 0 0", fontWeight: 500 }}>
            No relevant product reviews found yet. Check back later.
          </p>
        </div>
      )}

      {/* Privacy-conscious Embedded Video Modal (Single Active Player) */}
      {activeVideoId && (
        <div
          className={styles.videoModalOverlay}
          onClick={() => setActiveVideoId(null)}
        >
          <div
            className={styles.videoModalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.modalCloseBtn}
              onClick={() => setActiveVideoId(null)}
              aria-label="Close video player"
            >
              <X size={20} /> Close Player
            </button>
            <iframe
              className={styles.videoIframe}
              src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&rel=0&enablejsapi=1`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </section>
  );
}
