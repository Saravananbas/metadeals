"use client";

import { createPortal } from "react-dom";
import { Check, Copy, Tag } from "lucide-react";
import { BankLogo } from "@/components/deals/BankLogo";
import { offerHeadline, offerWith, type BankOfferView } from "@/features/deals/bank-offers";
import { formatPaise } from "@/features/deals/currency";

/**
 * Everything a deal offers on one small card: the coupon and every bank offer. It is drawn in the page body at fixed
 * coordinates under the offer row, so the deal card's own edges never cut it off.
 */
export function OfferPopover({ anchor, coupon, offers, copied, onCopy, onEnter, onLeave }: {
  anchor: DOMRect; coupon: string | null; offers: BankOfferView[]; copied: boolean;
  onCopy: (e: React.MouseEvent, code: string) => void; onEnter: () => void; onLeave: () => void;
}) {
  const width = Math.min(300, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const above = anchor.top > 240; // open upwards when there is room, otherwise below the row
  const style: React.CSSProperties = { position: "fixed", left, width, zIndex: 1200, ...(above ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }) };
  return createPortal(
    <div className="offer-popover" style={style} role="dialog" aria-label="Coupon and bank offers" onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={(e) => e.stopPropagation()}>
      {coupon && (
        <div className="offer-popover-block">
          <strong><Tag size={12} /> Coupon</strong>
          <div className="offer-popover-coupon"><code>{coupon}</code><button type="button" onClick={(e) => onCopy(e, coupon)}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}</button></div>
        </div>
      )}
      {offers.length > 0 && (
        <div className="offer-popover-block">
          <strong>Bank offers</strong>
          <ul>
            {offers.map((o) => (
              <li key={o.id}>
                <BankLogo name={o.bankName} logoUrl={o.bankLogoUrl} size={26} />
                <div>
                  <b>{offerHeadline(o)}</b> with {offerWith(o)}
                  <small>
                    {[o.schedule, o.minOrderMinor ? `Min. order ${formatPaise(o.minOrderMinor)}` : null, o.code ? `Code ${o.code}` : null, o.terms].filter(Boolean).join(" · ")}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>,
    document.body,
  );
}
