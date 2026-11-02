import { ArrowRight, SearchX, Zap } from "lucide-react";
import type { Deal } from "@/features/deals/types";
import { DealCard } from "./DealCard";

export type DealsSectionProps = { deals: Deal[]; savedIds: string[]; onSave: (id: string) => void; onView: (deal: Deal) => void; onReset: () => void; filterLabel?: string };

export function TopDealsSection({ deals, savedIds, onSave, onView, onReset, filterLabel, title = "Today’s Top Deals", subtitle = "Handpicked deals with the biggest savings for you" }: DealsSectionProps & { title?: string; subtitle?: string }) {
  return <section className="deals-section page-container" id="top-deals" aria-labelledby="deals-heading">
    <div className="section-heading"><div className="section-heading-left"><Zap className="deals-bolt" size={37} fill="var(--md-deal-rating)" stroke="var(--md-color-accent)" /><div><h2 id="deals-heading">{title}</h2><p>{subtitle}</p></div></div><button className="text-link" onClick={onReset}>View All Deals <ArrowRight size={17} /></button></div>
    {deals.some((deal) => deal.source !== "database") && <div className="demo-notice"><span>DEMO PREVIEW</span> Sample offers, ratings and imagery. Prices and availability are not verified.</div>}
    {filterLabel && <div className="filter-summary"><p role="status">{deals.length} {deals.length === 1 ? "result" : "results"} · {filterLabel}</p><button onClick={onReset}>Clear filters</button></div>}
    {deals.length ? <div className="deal-grid">{deals.map((deal) => <DealCard key={deal.id} deal={deal} saved={savedIds.includes(deal.id)} onSave={onSave} onView={onView} />)}</div>
      : <div className="empty-state"><SearchX size={36} /><h3>No published deals found</h3><p>Try another search or check back when new offers are published.</p><button onClick={onReset}>Browse all deals <ArrowRight size={16} /></button></div>}
  </section>;
}
