import Image from "next/image";
import { ArrowRight, Clock3, Heart, Star } from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { formatINR, getSavings } from "@/features/deals/pricing";
import { StoreLogo } from "./StoreLogo";

export function DealCard({ deal, saved, onSave, onView }: { deal: Deal; saved: boolean; onSave: (id: string) => void; onView: (deal: Deal) => void }) {
  const savings = getSavings(deal.originalPrice, deal.price);
  return <article className="deal-card" aria-labelledby={`title-${deal.id}`}>
    <div className="deal-image-wrap">
      <span className="discount-badge">{savings.percent}% OFF</span>
      <button className={`save-deal ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${deal.name}`} aria-pressed={saved} onClick={() => onSave(deal.id)}><Heart size={20} fill={saved ? "currentColor" : "none"} /></button>
      <button className="product-image-button" aria-label={`Preview ${deal.name}`} onClick={() => onView(deal)}><Image src={deal.image} alt={deal.name} fill sizes="(max-width: 639px) 46vw, (max-width: 1099px) 30vw, (max-width: 1279px) 23vw, 16vw" /></button>
    </div>
    <div className="deal-details">
      <h3 id={`title-${deal.id}`}><button onClick={() => onView(deal)}>{deal.name}</button></h3>
      <div className="deal-rating" aria-label={`Demo rating ${deal.rating} out of 5 from ${deal.reviewCount} reviews`}><Star size={14} fill="currentColor" /><span>{deal.rating}</span><span>({deal.reviewCount.toLocaleString("en-IN")})</span></div>
      <div className="deal-price"><strong>{formatINR(deal.price)}</strong><del>{formatINR(deal.originalPrice)}</del></div>
      <span className="savings">Save {formatINR(savings.amount)}</span>
      <div className="deal-bottom"><StoreLogo store={deal.store} /><button className="deal-link" onClick={() => onView(deal)}>View Deal <ArrowRight size={15} /></button></div>
      <p className="deal-expiry"><Clock3 size={11} />{deal.expiry === "expired" ? "Expired · demo" : "Demo · expiry unverified"}</p>
    </div>
  </article>;
}
