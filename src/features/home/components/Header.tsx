"use client";

import { Bell, BookOpen, ChevronDown, Grid2X2, Heart, House, Menu, ShoppingBag, Store, Tag, UserRound } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { DealFilters } from "@/features/deals/types";

export type Panel = "saved" | "stores" | "account" | "notifications" | "blog" | "bank" | null;

export function Header({ onPanel, onView, onHome, savedCount }: { onPanel: (panel: Panel) => void; onView: (view: DealFilters["view"]) => void; onHome: () => void; savedCount: number }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMenu = () => setMobileOpen(false);
  return <header className="site-header" onKeyDown={(event) => { if (event.key === "Escape") closeMenu(); }}>
    <a className="skip-link" href="#main">Skip to deals</a>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="MetaDeals4U home" onClick={() => { onHome(); closeMenu(); }}>
        <span className="brand-mark"><ShoppingBag size={34} strokeWidth={1.8} /><span className="brand-streak" /></span>
        <span><span className="brand-name">MetaDeals<span>4U</span></span><span className="brand-tagline">Deals • Offers • Best Prices</span></span>
      </Link>
      <nav aria-label="Main navigation" className={`main-nav ${mobileOpen ? "is-open" : ""}`} id="main-navigation">
        <Link className="nav-home" href="/" onClick={() => { onHome(); closeMenu(); }}><House size={19} fill="currentColor" />Home</Link>
        <details className="nav-dropdown"><summary><Tag size={19} />Deals<ChevronDown size={14} /></summary><div className="nav-dropdown-menu">
          {([['top', "Today's top deals"], ['featured', 'Featured deals'], ['latest', 'Latest deals']] as const).map(([view, label]) => <button key={view} onClick={(event) => { onView(view); closeMenu(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{label}</button>)}
        </div></details>
        <a href="#categories" onClick={closeMenu}><Grid2X2 size={19} />Categories<ChevronDown size={14} /></a>
        <button onClick={() => { onPanel("stores"); closeMenu(); }}><Store size={19} />Stores</button>
        <button onClick={() => { onPanel("blog"); closeMenu(); }}><BookOpen size={19} />Blog</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button notification-button" aria-label="Notifications" onClick={() => onPanel("notifications")}><Bell size={23} /><span className="notification-dot" /></button>
        <button className="icon-button" aria-label={`Saved deals (${savedCount})`} onClick={() => onPanel("saved")}><Heart size={23} />{savedCount > 0 && <span className="saved-count">{savedCount}</span>}</button>
        <button className="icon-button account-button" aria-label="Your account" onClick={() => onPanel("account")}><UserRound size={22} /></button>
        <button className="icon-button menu-toggle" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="main-navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={23} /></button>
      </div>
    </div>
  </header>;
}
