"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Heart } from "lucide-react";
import type { Deal, DealFilters } from "@/features/deals/types";
import { filterDeals } from "@/features/deals/filter";
import { formatINR } from "@/features/deals/pricing";
import { categories, stores } from "./catalog";
import { Header, type Panel } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { CategorySection } from "./components/CategorySection";
import { TopDealsSection } from "./components/TopDealsSection";
import { FeaturedDeals } from "./components/FeaturedDeals";
import { LatestDeals } from "./components/LatestDeals";
import { PromotionalBanners } from "./components/PromotionalBanners";
import { WhyMetaDeals } from "./components/WhyMetaDeals";
import { Footer } from "./components/Footer";
import { PopularStores } from "./components/PopularStores";
import { Dialog } from "./components/Dialog";
import { useSavedDeals } from "./saved-store";

const defaults: DealFilters = { query: "", category: "", store: "", view: "top" };
const titles = { saved: "Your saved deals", stores: "Popular stores", account: "Your MetaDeals4U account", notifications: "Deal updates", blog: "The smart shopping journal", bank: "Bank offers" };

export function Homepage({ deals }: { deals: Deal[] }) {
  const [filters, setFilters] = useState(defaults);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [notice, setNotice] = useState("");
  const saved = useSavedDeals();
  const scrollToDeals = () => document.getElementById("top-deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const reset = () => { setFilters(defaults); setQuery(""); scrollToDeals(); };
  const search = (text: string) => { setQuery(text); setFilters({ ...defaults, query: text }); scrollToDeals(); };
  const chooseStore = (store: string) => { setFilters({ ...defaults, store }); setQuery(""); setPanel(null); scrollToDeals(); };
  const save = (id: string) => {
    const wasSaved = saved.ids.includes(id);
    setNotice(saved.toggle(id) ? (wasSaved ? "Removed from saved deals." : "Saved on this browser only. Demo offer, not a live price.") : "Your browser blocked saving. Please enable local storage to save deals.");
  };
  const filterLabel = [filters.query ? `“${filters.query}”` : "", categories.find((c) => c.id === filters.category)?.label, stores.find((s) => s.id === filters.store)?.name].filter(Boolean).join(" · ");
  const sectionProps = { deals: filterDeals(deals, filters), savedIds: saved.ids, onSave: save, onView: setSelectedDeal, onReset: reset, filterLabel };
  const closeDialog = () => { setPanel(null); setSelectedDeal(null); };
  return <>
    <Header savedCount={saved.ids.filter((id) => deals.some((deal) => deal.id === id)).length} onHome={() => { setFilters(defaults); setQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onPanel={setPanel} onView={(view) => { setFilters({ ...defaults, view }); setQuery(""); scrollToDeals(); }} />
    <main id="main">
      <HeroSection query={query} onQuery={setQuery} onSearch={search} />
      <CategorySection selected={filters.category} onSelect={(category) => { setFilters({ ...defaults, category }); setQuery(""); scrollToDeals(); }} />
      <div className="deals-showcase">
        {filters.view === "featured" ? <FeaturedDeals {...sectionProps} /> : filters.view === "latest" ? <LatestDeals {...sectionProps} /> : <TopDealsSection {...sectionProps} />}
        <PromotionalBanners onStore={chooseStore} onBank={() => setPanel("bank")} />
        <WhyMetaDeals />
      </div>
    </main>
    <Footer />
    {notice && <div className="save-notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    <Dialog open={Boolean(panel || selectedDeal)} title={selectedDeal ? "Demo deal preview" : panel ? titles[panel] : ""} onClose={closeDialog}>
      {selectedDeal ? <div className="deal-preview"><Image src={selectedDeal.image} alt={selectedDeal.name} width={220} height={220} /><h3>{selectedDeal.name}</h3><strong className="preview-price">{formatINR(selectedDeal.price)} <small>sample price</small></strong><p>This is a demo offer with illustrative imagery and sample ratings. This price, stock and expiry have not been verified. The link below opens a retailer search or listing, not a guaranteed offer.</p><a className="primary-link" href={selectedDeal.retailerUrl} target="_blank" rel="noopener noreferrer">Check at {stores.find((store) => store.id === selectedDeal.store)?.name} <ArrowUpRight size={17} /></a></div>
        : panel === "stores" ? <PopularStores onStore={chooseStore} />
        : panel === "saved" ? <div className="saved-panel"><p>Saved on this browser only. No account or cross-device sync. All offers are demos.</p>{deals.filter((deal) => saved.ids.includes(deal.id)).map((deal) => <div className="saved-row" key={deal.id}><button onClick={() => setSelectedDeal(deal)}><Image src={deal.image} width={55} height={55} alt="" /><span>{deal.name}<strong>{formatINR(deal.price)}</strong></span></button><button className="icon-button" aria-label={`Unsave ${deal.name}`} onClick={() => save(deal.id)}><Heart size={19} fill="currentColor" /></button></div>)}{!deals.some((deal) => saved.ids.includes(deal.id)) && <div className="panel-empty"><Heart size={35} /><h3>Your favourites start here</h3><p>Tap the heart on a deal to keep it handy.</p></div>}</div>
        : panel === "bank" ? <div className="panel-copy"><p>Bank offers will appear here once live promotions are connected. No card discount is currently verified in this preview.</p><p>Before using a retailer’s card offer, check the eligible card, minimum spend, maximum discount and offer dates on the retailer’s website.</p></div>
        : panel === "account" ? <div className="panel-copy"><p>Account sign-in is not enabled in this preview. You can browse and save demo deals locally without an account.</p><button className="primary-link" onClick={() => setPanel("saved")}>View saved deals <Heart size={17} /></button></div>
        : panel === "notifications" ? <div className="panel-copy"><p>You’re viewing the MetaDeals4U homepage preview. Live deal alerts aren’t connected yet.</p><p>No notification subscription has been created.</p></div>
        : panel === "blog" ? <div className="panel-copy"><p>Shopping guides are coming soon.</p><h3>A smarter way to compare</h3><p>Compare the final checkout price, delivery charges, seller ratings and return policy. A headline discount alone doesn’t tell the whole story.</p></div> : null}
    </Dialog>
  </>;
}
