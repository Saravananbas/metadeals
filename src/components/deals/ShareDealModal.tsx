"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Link2, MessageCircle, Send, Tag, X } from "lucide-react";
import { offerShareLine } from "@/features/deals/bank-offers";
import { formatPaise } from "@/features/deals/currency";
import { buildShareMessage } from "@/features/deals/share-card/message";
import { chooseProductImage } from "@/features/deals/share-card/select-image";
import type { ShareDealData } from "@/features/deals/share-card/types";
import { minorSavings } from "@/features/deals/validation";
import styles from "./ShareDealModal.module.css";

type Product = { url: string; file: File } | null;
const cache = new Map<string, Product>(); // the chosen photo per deal for this visit

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the older way */ }
  try {
    const box = document.createElement("textarea");
    box.value = text; box.setAttribute("readonly", ""); box.style.position = "fixed"; box.style.opacity = "0";
    document.body.appendChild(box); box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch { return false; }
}

/**
 * Share This Deal: the deal's own product photo and a plain text message (title, price, MRP, coupon, bank offers, link), sent together.
 * Nothing is drawn or branded; the photo is the one already on the deal. The coupon can be copied with one tap here in the preview.
 */
export function ShareDealModal({ deal, url, onClose, onShared }: { deal: ShareDealData; url: string; onClose: () => void; onShared: () => void }) {
  const imagesKey = deal.images.join("|");
  const [product, setProduct] = useState<Product | undefined>(() => cache.get(imagesKey)); // undefined = still choosing
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [couponCopied, setCouponCopied] = useState(false);
  const counted = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const message = useMemo(() => buildShareMessage(deal, url), [deal, url]);
  const { savingsMinor } = minorSavings(deal.mrpMinor, deal.priceMinor);

  useEffect(() => {
    if (product !== undefined) return;
    let live = true;
    chooseProductImage(deal.images).then((p) => { if (!live) return; cache.set(imagesKey, p); setProduct(p); });
    return () => { live = false; };
  }, [product, deal.images, imagesKey]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const ready = product !== undefined;
  const file = product?.file ?? null;
  const counts = () => { if (!counted.current) { counted.current = true; onShared(); } };
  const download = () => {
    if (!file) return;
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href; a.download = `${deal.slug}.${file.name.split(".").pop()}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  };

  async function copyCoupon() {
    if (!deal.couponCode) return;
    if (await copyText(deal.couponCode)) { setCouponCopied(true); setToast("Coupon copied!"); setTimeout(() => setCouponCopied(false), 1800); setTimeout(() => setToast(null), 1800); }
    else setToast("Could not copy. Select the code and copy it by hand.");
  }

  /** The device's share sheet carries the photo and the text together; where it cannot, the photo is saved to attach and the app's share page opens with the text. */
  async function viaApp(app: "whatsapp" | "telegram") {
    if (typeof navigator.canShare === "function" && (file ? navigator.canShare({ files: [file] }) : true) && typeof navigator.share === "function") {
      try {
        await navigator.share(file ? { files: [file], text: message } : { text: message });
        counts(); setNotice("Shared.");
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return; // the visitor closed the sheet
      }
    }
    const name = app === "whatsapp" ? "WhatsApp" : "Telegram";
    const target = app === "whatsapp"
      ? `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
      : `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(buildShareMessage(deal, url, { includeUrl: false }))}`;
    window.open(target, "_blank", "noopener"); // opened first, while the click still counts as the visitor's own action
    if (file) download();
    const copied = await copyText(message);
    counts();
    setNotice(file
      ? `The product photo is saved to your downloads${copied ? " and the message is copied" : ""}. ${name} could not take the photo from here, so attach the saved photo to your message.`
      : `${name} is opening with the message${copied ? " (also copied)" : ""}. This deal has no usable photo, so only the text is shared.`);
  }

  async function copyMessage() { if (await copyText(message)) { counts(); setNotice("Message copied."); } else setNotice("Could not copy the message."); }
  async function copyLink() { if (await copyText(url)) { counts(); setNotice("Link copied."); } else setNotice("Could not copy the link."); }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="share-deal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2 id="share-deal-title">Share This Deal</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
        </header>

        {/* The preview follows the order of the shared message: photo, title, price, MRP, coupon, bank offers, link. */}
        <div className={styles.preview}>
          <div className={styles.photo}>
            {product ? (
              // eslint-disable-next-line @next/next/no-img-element -- the deal's own photo, shown as it is
              <img src={product.url} alt={deal.title} />
            ) : <p>{ready ? "No product photo is available for this deal, so only the text is shared." : "Getting the product photo…"}</p>}
          </div>
          <p className={styles.title}>{deal.title}</p>
          <p className={styles.line}>Selling Price: <strong>{formatPaise(deal.priceMinor)}</strong></p>
          {savingsMinor > 0 && <p className={styles.line}>MRP: {formatPaise(deal.mrpMinor)}</p>}
          {deal.couponCode && (
            <p className={styles.line}>Coupon:{" "}
              <button type="button" className={styles.coupon} onClick={() => void copyCoupon()} aria-label={`Copy coupon code ${deal.couponCode}`}>
                <Tag size={14} aria-hidden="true" /><code>{deal.couponCode}</code>{couponCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              </button>
            </p>
          )}
          {deal.bankOffers.length > 0 && (
            <div className={styles.line}>
              <strong>Bank Offers:</strong>
              <ul>{deal.bankOffers.map((o) => <li key={o.id}>{offerShareLine(o)}</li>)}</ul>
            </div>
          )}
          <p className={styles.line}><strong>Open Deal:</strong><br /><span className={styles.url}>{url}</span></p>
          {deal.expired && <p className={styles.expired}>This deal has expired. The link still opens its page.</p>}
        </div>
        <p className={styles.toast} role="status" aria-live="polite">{toast ?? ""}</p>

        <div className={styles.main}>
          <button type="button" className={styles.whatsapp} disabled={!ready} onClick={() => void viaApp("whatsapp")}><MessageCircle size={20} aria-hidden="true" /> WhatsApp</button>
          <button type="button" className={styles.telegram} disabled={!ready} onClick={() => void viaApp("telegram")}><Send size={20} aria-hidden="true" /> Telegram</button>
        </div>
        <div className={styles.more}>
          <button type="button" disabled={!file} onClick={() => { download(); counts(); setNotice("The product photo is saved to your downloads."); }}><Download size={16} aria-hidden="true" /> Download Product Image</button>
          <button type="button" onClick={() => void copyMessage()}><Copy size={16} aria-hidden="true" /> Copy Deal Message</button>
          <button type="button" onClick={() => void copyLink()}><Link2 size={16} aria-hidden="true" /> Copy Deal Link</button>
        </div>
        <p className={styles.notice} role="status" aria-live="polite">{notice ?? ""}</p>
        <button type="button" className={styles.closeBottom} onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
