import { ArrowRight, CreditCard } from "lucide-react";

export function PromotionalBanners({ onStore, onBank }: { onStore: (store: string) => void; onBank: () => void }) {
  return <section className="promotions page-container" aria-label="Sample promotional banners">
    <article className="promo promo-amazon"><div className="promo-brand"><span>amazon.in</span><strong>Great Indian<br /><b>Festival</b></strong></div><span className="festival-art" aria-hidden="true">🐘</span><div className="promo-offer"><strong>Up to 70% Off</strong><span>on Top Brands</span><small>Sample promotion</small></div><button onClick={() => onStore("amazon")}>Shop Now <ArrowRight size={14} /></button></article>
    <article className="promo promo-flipkart"><div className="promo-brand"><span>Flipkart <i aria-hidden="true">⚡</i></span><strong>Big Billion Days</strong></div><div className="promo-offer"><strong>Up to 80% Off</strong><span>Mobiles, Electronics & More</span><small>Sample promotion</small></div><button onClick={() => onStore("flipkart")}>Shop Now <ArrowRight size={14} /></button></article>
    <article className="promo promo-bank"><CreditCard className="bank-art" size={61} strokeWidth={1.6} /><div className="promo-offer"><strong>Extra Savings<br />with Bank Offers</strong><span>Explore card offers</span><small>Preview · no live offers</small></div><button onClick={onBank}>View Offers <ArrowRight size={14} /></button></article>
  </section>;
}
