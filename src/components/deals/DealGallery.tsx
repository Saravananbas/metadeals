"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";
import { DealActionRow } from "./DealActionRow";

interface DealGalleryProps {
  dealId: string;
  slug: string;
  title: string;
  primaryImage: string;
  images?: string[];
  discountPercent: number;
  /** Same "Expired" overlay as the deal card on the home page. */
  expired?: boolean;
  /** Shown directly under the picture (price and Buy Now). */
  children?: ReactNode;
}

const PLACEHOLDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="%23f1f5f9"><rect width="400" height="400" fill="%23f8fafc"/><path d="M140 180l40-40 80 80 40-40 60 60H100z" fill="%23cbd5e1"/><circle cx="160" cy="140" r="20" fill="%23cbd5e1"/><text x="50%25" y="75%25" text-anchor="middle" fill="%2394a3b8" font-size="14" font-family="sans-serif">Product Image Verified</text></svg>`;

export function DealGallery({
  dealId,
  slug,
  title,
  primaryImage,
  images: additionalImages = [],
  discountPercent,
  expired = false,
  children,
}: DealGalleryProps) {
  const galleryImages = Array.from(new Set([primaryImage, ...additionalImages].filter(Boolean)));
  const imageCount = galleryImages.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const activeImage = galleryImages[activeIndex] || PLACEHOLDER_SVG;
  const displayedImage = failedImages.includes(activeImage) ? PLACEHOLDER_SVG : activeImage;

  useEffect(() => {
    if (imageCount < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % imageCount);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [imageCount]);

  const changeImage = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + galleryImages.length) % galleryImages.length);
  };

  return (
    <div className={styles.galleryCard}>
      {/* Main Image Box */}
      <div
        className={styles.mainImageWrapper}
        onClick={() => setIsZoomOpen(true)}
        title="Click to view full image"
      >
        {discountPercent > 0 && (
          <span className={styles.discountBadge}>{discountPercent}% OFF</span>
        )}

        <Image
          unoptimized
          src={displayedImage}
          alt={title}
          fill
          style={{ objectFit: "contain", padding: 16 }}
          onError={() => setFailedImages((current) => current.includes(activeImage) ? current : [...current, activeImage])}
        />

        {expired && (
          <div className="deal-expired-overlay" aria-label="This deal has expired">
            <span>Expired</span>
          </div>
        )}

        {galleryImages.length > 1 && (
          <>
            <button
              type="button"
              className={`${styles.galleryArrow} ${styles.galleryArrowLeft}`}
              aria-label="Show previous product image"
              onClick={(event) => { event.stopPropagation(); changeImage(-1); }}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={`${styles.galleryArrow} ${styles.galleryArrowRight}`}
              aria-label="Show next product image"
              onClick={(event) => { event.stopPropagation(); changeImage(1); }}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {children}

      <DealActionRow dealId={dealId} slug={slug} />

      {/* Zoom Lightbox Modal */}
      {isZoomOpen && (
        <div
          className={styles.videoModalOverlay}
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: 720,
              width: "90%",
              aspectRatio: "1",
              background: "var(--md-white)",
              borderRadius: 20,
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsZoomOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "var(--md-color-surface-muted)",
                border: "none",
                borderRadius: "50%",
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                zIndex: 10,
              }}
            >
              <X size={20} color="var(--md-color-text)" />
            </button>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <Image
                unoptimized
                src={displayedImage}
                alt={title}
                fill
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

