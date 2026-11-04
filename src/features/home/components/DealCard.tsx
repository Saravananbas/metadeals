import Image from "next/image";
import { ArrowRight, Clock3, Heart, Star } from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { formatINR, getSavings } from "@/features/deals/pricing";
import { StoreLogo } from "./StoreLogo";

export function DealCard({ deal, saved, onSave, onView }: { deal: Deal; saved: boolean; onSave: (id: string) => void; onView: (deal: Deal) => void }) {
  const savings = getSavings(deal.originalPrice, deal.price);

  return (
    <article
      className="deal-card"
      aria-labelledby={`title-${deal.id}`}
      onClick={() => onView(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(deal);
        }
      }}
      style={{ cursor: "pointer" }}
    >
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
          <Heart size={20} fill={saved ? "currentColor" : "none"} />
        </button>
        <div className="product-image-button" aria-label={`Preview ${deal.name}`}>
          <Image
            src={deal.image || "/images/placeholder.png"}
            alt={deal.name}
            fill
            sizes="(max-width: 639px) 46vw, (max-width: 1099px) 30vw, (max-width: 1279px) 23vw, 16vw"
          />
        </div>
      </div>
      <div className="deal-details">
        <h3 id={`title-${deal.id}`}>
          <span className="deal-title-text">{deal.name}</span>
        </h3>
        {deal.rating !== null && (
          <div
            className="deal-rating"
            aria-label={`Rating ${deal.rating} out of 5. Source: ${deal.ratingSource ?? "demo"}`}
          >
            <Star size={14} fill="currentColor" />
            <span>{deal.rating}</span>
            <span>
              {deal.reviewCount !== null
                ? `(${deal.reviewCount.toLocaleString("en-IN")})`
                : ""}
            </span>
          </div>
        )}
        {deal.ratingSource && <small>{deal.ratingSource}</small>}
        <div className="deal-price">
          <strong>{formatINR(deal.price)}</strong>
          <del>{formatINR(deal.originalPrice)}</del>
        </div>
        <span className="savings">Save {formatINR(savings.amount)}</span>
        <div className="deal-bottom">
          <StoreLogo store={deal.store} name={deal.storeName} />
          <button
            type="button"
            className="deal-link"
            aria-label={`View deal for ${deal.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onView(deal);
            }}
          >
            View Deal <ArrowRight size={15} />
          </button>
        </div>
        <p className="deal-expiry">
          <Clock3 size={11} />
          {deal.source === "database"
            ? deal.expiresAt
              ? `Ends ${new Date(deal.expiresAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`
              : "No expiry supplied"
            : "Demo · expiry unverified"}
        </p>
      </div>
    </article>
  );
}
