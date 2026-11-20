"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import styles from "../profile.module.css";

type Props = { title: string; price: string; mrp: string; store: string; brand: string; coupon: string; description: string; imageSrc: string; onClose: () => void };
const rupees = (v: string) => `₹${Number(v).toLocaleString("en-IN")}`;

/** "Preview Deal": the card as visitors will see it, from what is typed so far. Nothing is sent. */
export function PreviewDialog({ title, price, mrp, store, brand, coupon, description, imageSrc, onClose }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const discount = Number(mrp) > Number(price) && Number(price) > 0 ? Math.floor(((Number(mrp) - Number(price)) * 100) / Number(mrp)) : 0;
  return (
    <div className={styles.previewOverlay} onClick={onClose} role="presentation">
      <div className={styles.previewBox} role="dialog" aria-modal="true" aria-label="Deal preview" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.previewClose} onClick={onClose} aria-label="Close preview"><X size={18} /></button>
        <p className={styles.hint}>This is how your deal will look after our team approves it.</p>
        <div className={styles.previewCard}>
          {imageSrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={imageSrc} alt="" referrerPolicy="no-referrer" />
            : <div className={styles.previewNoImage}>No picture yet</div>}
          {discount > 0 && <span className={styles.previewBadge}>{discount}% OFF</span>}
          <h3>{title || "Your deal title"}</h3>
          <div className={styles.previewPrice}><strong>{price ? rupees(price) : "₹0"}</strong>{Number(mrp) > 0 && <del>{rupees(mrp)}</del>}</div>
          {discount > 0 && <span className={styles.previewSave}>Save {rupees(String(Number(mrp) - Number(price)))} ({discount}% OFF)</span>}
          <small>{[store, brand].filter(Boolean).join(" · ")}</small>
          {coupon && <code>Coupon: {coupon}</code>}
          {description && <p>{description.slice(0, 220)}{description.length > 220 ? "…" : ""}</p>}
        </div>
      </div>
    </div>
  );
}
