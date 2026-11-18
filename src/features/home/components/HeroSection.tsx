import Image from "next/image";
import { CalendarCheck, HeartHandshake, ShieldCheck, Zap } from "lucide-react";
import { TrendingSearches } from "./TrendingSearches";

export function HeroSection({ onSearch }: { onSearch: (query: string) => void }) {
  return <section className="hero" aria-labelledby="hero-title"><div className="hero-inner">
    <div className="hero-copy">
      <span className="hero-eyebrow">🔥 India’s Deals Destination</span>
      <h1 id="hero-title">The Best Deals.<br />The <span>Smartest Savings.</span></h1>
      <p>Discover handpicked deals, exclusive offers and big discounts<br className="wide-break" /> from Amazon, Flipkart and top online stores.</p>
      <TrendingSearches onSearch={onSearch} />
    </div>
    <div className="hero-art" role="img" aria-label="Laptop, smartphone, headphones, smartwatch and shopping bag">
      <span className="hero-art-orb hero-art-orb-one" aria-hidden="true" />
      <span className="hero-art-orb hero-art-orb-two" aria-hidden="true" />
      <span className="hero-stage" aria-hidden="true" />
      <span className="hero-bag" aria-hidden="true" />
      <Image className="hero-product hero-product-headphones" src="/images/products/headphones.png" alt="" width={500} height={500} sizes="(max-width: 767px) 28vw, 15vw" />
      <Image className="hero-product hero-product-laptop" src="/images/products/laptop.png" alt="" width={500} height={500} sizes="(max-width: 767px) 44vw, 23vw" loading="eager" fetchPriority="high" />
      <Image className="hero-product hero-product-watch" src="/images/products/watch.png" alt="" width={500} height={500} sizes="(max-width: 767px) 17vw, 9vw" />
      <Image className="hero-product hero-product-phone" src="/images/products/phone.png" alt="" width={500} height={500} sizes="(max-width: 767px) 22vw, 12vw" />
      <div className="hero-dots" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
    <div className="hero-highlights">
      <div className="top-deals-sticker"><Zap fill="var(--md-hero-highlight)" stroke="var(--md-deal-rating)" /><span>TODAY’S<br />TOP DEALS</span></div>
      <div className="hero-highlight"><span><HeartHandshake /></span><div><strong>Huge Discounts</strong><small>More ways to save</small></div></div>
      <div className="hero-highlight"><span><ShieldCheck /></span><div><strong>Shop with Confidence</strong><small>Compare before you buy</small></div></div>
      <div className="hero-highlight"><span><CalendarCheck /></span><div><strong>Discover More</strong><small>Your next favourite find</small></div></div>
    </div>
  </div></section>;
}
