"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Link2, MessageCircle, Send, Tag, X } from "lucide-react";
import { buildShareMessage } from "@/features/deals/share-card/message";
import { cardKey, renderShareCard, type RenderedCard } from "@/features/deals/share-card/render";
import type { ShareDealData } from "@/features/deals/share-card/types";
import styles from "./ShareDealModal.module.css";

type Ready = RenderedCard & { previewUrl: string };
const cache = new Map<string, Ready>(); // finished cards for this visit, keyed so any change to the deal draws a fresh one

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

/** "Share This Deal": a branded picture of the deal, the coupon to copy with one tap, and WhatsApp, Telegram, download and copy choices. */
export function ShareDealModal({ deal, url, onClose, onShared }: { deal: ShareDealData; url: string; onClose: () => void; onShared: () => void }) {
  const key = useMemo(() => cardKey(deal, url), [deal, url]);
  const [card, setCard] = useState<Ready | null>(() => cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [couponCopied, setCouponCopied] = useState(false);
  const counted = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const message = useMemo(() => buildShareMessage(deal, url), [deal, url]);

  useEffect(() => {
    if (card) return;
    let live = true;
    renderShareCard(deal, url).then((r) => {
      if (!live) return;
      const ready = { ...r, previewUrl: URL.createObjectURL(r.blob) };
      cache.set(key, ready);
      setCard(ready);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [card, deal, url, key]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const counts = () => { if (!counted.current) { counted.current = true; onShared(); } };
  const file = () => (card ? new File([card.blob], `metadeals-${deal.slug}.png`, { type: "image/png" }) : null);
  const download = () => {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.previewUrl; a.download = `metadeals-${deal.slug}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  async function copyCoupon() {
    if (!deal.couponCode) return;
    if (await copyText(deal.couponCode)) { setCouponCopied(true); setToast("Coupon copied!"); setTimeout(() => setCouponCopied(false), 1800); setTimeout(() => setToast(null), 1800); }
    else setToast("Could not copy. Select the code and copy it by hand.");
  }

  /** WhatsApp and Telegram: the device's share sheet with the picture when it can carry files, else (desktop) the app's own share page with the message and the picture saved to attach. */
  async function viaApp(app: "whatsapp" | "telegram") {
    const f = file();
    if (!f) return;
    // Desktop share sheets (Windows, Mac) hand the app only the picture and drop the text, so only touch devices use it; desktop opens the app's own share page with the message.
    const touchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (touchDevice && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: deal.title, text: message });
        counts(); setNotice("Shared.");
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return; // the visitor closed the sheet
      }
    }
    // Desktop: the picture goes on the clipboard (paste it first), then the message is copied on request, so the picture comes before the text in the chat.
    const target = app === "whatsapp" ? "https://web.whatsapp.com/" : "https://web.telegram.org/";
    window.open(target, "_blank", "noopener"); // opened first, while the click still counts as the visitor's own action
    let pictureCopied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": f })]); pictureCopied = true; } catch { download(); }
    counts();
    setNotice(`${pictureCopied ? "Picture copied" : "Picture saved to your downloads"}. In ${app === "whatsapp" ? "WhatsApp" : "Telegram"} ${pictureCopied ? "paste it (Ctrl+V)" : "attach it"} and send, then press "Copy message" here and paste the message after it.`);
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

        <div className={styles.preview}>
          {card ? (
            // eslint-disable-next-line @next/next/no-img-element -- a picture made in this browser, shown from a local address
            <img src={card.previewUrl} alt={`Deal card for ${deal.title}`} width={card.width} height={card.height} />
          ) : failed ? <p role="alert">The picture could not be made. You can still share the message and link below.</p> : <p>Making your deal picture…</p>}
        </div>

        {deal.couponCode && (
          <button type="button" className={styles.coupon} onClick={() => void copyCoupon()} aria-label={`Copy coupon code ${deal.couponCode}`}>
            <Tag size={16} aria-hidden="true" /><code>{deal.couponCode}</code>{couponCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </button>
        )}
        <p className={styles.toast} role="status" aria-live="polite">{toast ?? ""}</p>

        <div className={styles.main}>
          <button type="button" className={styles.whatsapp} disabled={!card} onClick={() => void viaApp("whatsapp")}><MessageCircle size={20} aria-hidden="true" /> WhatsApp</button>
          <button type="button" className={styles.telegram} disabled={!card} onClick={() => void viaApp("telegram")}><Send size={20} aria-hidden="true" /> Telegram</button>
        </div>
        <div className={styles.more}>
          <button type="button" disabled={!card} onClick={() => { download(); counts(); setNotice("The picture is saved to your downloads."); }}><Download size={16} aria-hidden="true" /> Download Deal Image</button>
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
