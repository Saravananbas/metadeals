"use client";
import { Search } from "lucide-react";

type Cat = { slug: string; name: string };

/** Phone-only search box and category chips above the deal feed (hidden on larger screens by CSS). */
export function MobileFeedBar({ query, onQuery, onSearch, categories, selected, onSelect }: {
  query: string; onQuery: (q: string) => void; onSearch: (q: string) => void; categories: Cat[]; selected: string; onSelect: (slug: string) => void;
}) {
  return (
    <div className="mobile-feed-bar">
      <form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(query); }}>
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search deals, brands, products" aria-label="Search deals" autoComplete="off" />
      </form>
      <div className="mobile-chips">
        <button type="button" aria-pressed={!selected} onClick={() => onSelect("")}>All Deals</button>
        {categories.map((c) => <button type="button" key={c.slug} aria-pressed={selected === c.slug} onClick={() => onSelect(c.slug)}>{c.name}</button>)}
      </div>
    </div>
  );
}
