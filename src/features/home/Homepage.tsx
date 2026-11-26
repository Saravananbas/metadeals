"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import type { Deal, DealFilters } from "@/features/deals/types";


import { formatINR } from "@/features/deals/pricing";
import { categories, stores } from "./catalog";
import { Header, type Panel } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { TopDealsSection } from "./components/TopDealsSection";
import { FeaturedDeals } from "./components/FeaturedDeals";
import { LatestDeals } from "./components/LatestDeals";
import { PromotionalBanners } from "./components/PromotionalBanners";
import { WhyMetaDeals } from "./components/WhyMetaDeals";
import { Footer } from "./components/Footer";
import { PopularStores } from "./components/PopularStores";
import { MobileFeedBar } from "./components/MobileFeedBar";
import { Dialog } from "./components/Dialog";
import { useSavedDeals } from "./saved-store";
import { HOME_PAGE_SIZE } from "@/features/deals/page-size";
import { Pagination } from "./components/Pagination";

const defaults: DealFilters = { query: "", category: "", store: "", view: "top" };
const titles = { saved: "Your saved deals", stores: "Popular stores", account: "Your MetaDeals4U account", notifications: "Deal updates", blog: "The smart shopping journal", bank: "Bank offers" };

export function Homepage({
  deals: initialDeals,
  initialPage = 1,
  initialTotalPages = 1,
  initialCatalog,
  communityEnabled = false,
}: {
  deals: Deal[];
  initialPage?: number;
  initialTotalPages?: number;
  communityEnabled?: boolean;
  initialCatalog?: {
    categories: { id: string; slug: string; name: string; parentId?: string | null }[];
    merchants: { id: string; slug: string; name: string }[];
  };
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [catalog, setCatalog] = useState(initialCatalog ?? { categories: [], merchants: [] });
  const [filters, setFilters] = useState(defaults);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newDeals, setNewDeals] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(0);
  const seenAt = useRef<string | null>(null);
  const checkedAt = useRef<string | null>(null);
  // Any new search, category or store starts again from page 1.
  const applyFilters = (next: DealFilters) => { setPage(1); setFilters(next); };
  const [query, setQuery] = useState("");
  const isInitialMount = useRef(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState("");
  const saved = useSavedDeals();
  const router = useRouter();

  // Other pages (the deal page header) open the home page with ?q=, ?category= or ?view=.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const view = p.get("view");
    const next: DealFilters = { ...defaults, query: (p.get("q") ?? "").slice(0, 100), category: (p.get("category") ?? "").slice(0, 100), view: view === "latest" || view === "featured" ? view : "top" };
    if (!next.query && !next.category && next.view === "top") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the address bar is only possible after hydration
    setQuery(next.query); setPage(1); setFilters(next);
  }, []);

  // Search & category filter changes (skip on initial mount since server already provided initialDeals)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    setLoadError("");

    const params = new URLSearchParams({
      q: filters.query,
      category: filters.category,
      store: filters.store,
      view: filters.view,
      page: String(page),
      limit: String(HOME_PAGE_SIZE),
    });

    fetch(`/api/v1/home-deals?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Deals could not be loaded. Please retry.");
        return res.json();
      })
      .then((result) => {
        setDeals(result.data || []);
        setTotalPages(result.totalPages ?? 1);
        setIsSearching(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoadError(err.message || "Loading failed.");
          setIsSearching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filters, page, refreshKey]);

  // Quietly looks for newly published deals once a minute while the tab is visible; the visitor chooses when to show them.
  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/v1/home-deals/new${seenAt.current ? `?since=${encodeURIComponent(seenAt.current)}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { count: number; now: string };
        checkedAt.current = data.now;
        if (!seenAt.current) seenAt.current = data.now; else if (data.count > 0) setNewDeals(data.count);
      } catch { /* a missed check is fine; the next one tries again */ }
    };
    void check();
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);
  const showNewDeals = () => { seenAt.current = checkedAt.current; setNewDeals(0); setDismissedAt(0); setPage(1); setRefreshKey((k) => k + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  useEffect(() => {
    if (!initialCatalog?.categories?.length) {
      fetch("/api/v1/catalog")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setCatalog(data);
        })
        .catch(() => {});
    }
  }, [initialCatalog]);

  const scrollToDeals = () => {
    const el = document.getElementById("top-deals") || document.getElementById("deals-showcase");
    if (el) {
      const yOffset = -70;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  };

  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target === page && !loadError) return;
    setLoadError(""); setPage(target);
    // Page 1 keeps the plain address; a shareable ?page=N is only kept while no search or filter is active.
    if (!filters.query && !filters.category && !filters.store && filters.view === "top") window.history.replaceState(null, "", target > 1 ? `/?page=${target}` : "/");
    scrollToDeals();
  };

  const reset = () => {
    applyFilters(defaults);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const search = (text: string) => {
    const trimmed = text.trim();
    setQuery(trimmed);
    applyFilters({ ...defaults, query: trimmed });
    setTimeout(() => scrollToDeals(), 50);
  };

  const chooseStore = (store: string) => {
    applyFilters({ ...defaults, store });
    setQuery("");
    setPanel(null);
    scrollToDeals();
  };

  const openDealPage = (deal: Deal) => {
    router.push(`/deal/${encodeURIComponent(deal.slug || deal.id)}`);
  };
  const save = (id: string) => {
    const wasSaved = saved.ids.includes(id);
    setNotice(saved.toggle(id) ? (wasSaved ? "Removed from saved deals." : "Saved on this browser only.") : "Your browser blocked saving. Please enable local storage to save deals.");
  };
  const activeCategoryName =
    catalog.categories.find((c) => c.slug === filters.category)?.name ||
    categories.find((c) => c.id === filters.category)?.label;
  const activeStoreName =
    catalog.merchants.find((m) => m.slug === filters.store)?.name ||
    stores.find((s) => s.id === filters.store)?.name;

  const filterLabel = [
    filters.query ? `“${filters.query}”` : "",
    activeCategoryName,
    activeStoreName,
  ].filter(Boolean).join(" · ");
  const sectionProps = { deals, savedIds: saved.ids, onSave: save, onView: openDealPage, onReset: reset, filterLabel };
  const closeDialog = () => setPanel(null);
  const mainCategories = catalog.categories.filter((c) => !c.parentId);
  return <>
    <Header query={query} onQuery={setQuery} onSearch={search} communityEnabled={communityEnabled} categories={catalog.categories} onCategory={(cat) => { applyFilters({ ...defaults, category: cat }); setQuery(""); scrollToDeals(); }} savedCount={saved.ids.filter((id) => deals.some((deal) => deal.id === id)).length} onHome={() => { setFilters(defaults); setQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onPanel={(next)=>{if(next==="account")router.push("/account");else setPanel(next);}} onView={(view) => { setFilters({ ...defaults, view }); setQuery(""); scrollToDeals(); }} />
    <main id="main">
      {newDeals > dismissedAt && (
        <div className="new-deals-toast" role="status">
          <span className="new-deals-dot" aria-hidden="true" />
          <span><strong>{newDeals} new {newDeals === 1 ? "deal" : "deals"}</strong> just posted</span>
          <button type="button" className="new-deals-show" onClick={showNewDeals}>Show</button>
          <button type="button" className="new-deals-close" aria-label="Dismiss" onClick={() => setDismissedAt(newDeals)}>×</button>
        </div>
      )}
      <MobileFeedBar
        query={query} onQuery={setQuery} onSearch={search}
        categories={mainCategories.map((c) => ({ slug: c.slug, name: c.name }))}
        selected={filters.category}
        onSelect={(category) => { applyFilters({ ...defaults, category }); setQuery(""); scrollToDeals(); }}
      />
      <HeroSection onSearch={search} />
      <div className="deals-showcase" id="deals-showcase">
        {filters.view === "featured" ? <FeaturedDeals {...sectionProps} /> : filters.view === "latest" ? <LatestDeals {...sectionProps} /> : <TopDealsSection {...sectionProps} />}
        <div className="page-container" aria-live="polite">
          {deals.some((d) => d.source === "demo") && <p>{deals.length} sample deals loaded</p>}
          {isSearching ? <p>Loading deals…</p> : loadError ? <p role="alert">{loadError} <button onClick={() => goToPage(page)}>Retry</button></p> : null}
          <Pagination page={page} totalPages={totalPages} disabled={isSearching} onPage={goToPage} />
        </div>
        <PromotionalBanners onStore={chooseStore} onBank={() => setPanel("bank")} />
        <WhyMetaDeals />
      </div>
    </main>
    <Footer />
    {notice && <div className="save-notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    <Dialog open={Boolean(panel)} title={panel ? titles[panel] : ""} onClose={closeDialog}>
      {panel === "stores" ? <PopularStores items={catalog.merchants.length ? catalog.merchants.map(m=>({id:m.slug,name:m.name})) : stores} onStore={chooseStore} />
        : panel === "saved" ? <div className="saved-panel"><p>Saved on this browser only. No account or cross-device sync. Prices and availability may change at the retailer.</p>{deals.filter((deal) => saved.ids.includes(deal.id)).map((deal) => <div className="saved-row" key={deal.id}><button onClick={() => { setPanel(null); openDealPage(deal); }}><Image src={deal.image} width={55} height={55} alt="" /><span>{deal.name}<strong>{formatINR(deal.price)}</strong></span></button><button className="icon-button" aria-label={`Unsave ${deal.name}`} onClick={() => save(deal.id)}><Heart size={19} fill="currentColor" /></button></div>)}{!deals.some((deal) => saved.ids.includes(deal.id)) && <div className="panel-empty"><Heart size={35} /><h3>Your favourites start here</h3><p>Tap the heart on a deal to keep it handy.</p></div>}</div>
        : panel === "bank" ? <div className="panel-copy"><p>Bank offers will appear here once live promotions are connected. No card discount is currently verified in this preview.</p><p>Before using a retailer’s card offer, check the eligible card, minimum spend, maximum discount and offer dates on the retailer’s website.</p></div>
        : panel === "account" ? <div className="panel-copy"><p>Account sign-in is not enabled in this preview. You can browse and save demo deals locally without an account.</p><button className="primary-link" onClick={() => setPanel("saved")}>View saved deals <Heart size={17} /></button></div>
        : panel === "notifications" ? <div className="panel-copy"><p>You’re viewing the MetaDeals4U homepage preview. Live deal alerts aren’t connected yet.</p><p>No notification subscription has been created.</p></div>
        : panel === "blog" ? <div className="panel-copy"><p>Shopping guides are coming soon.</p><h3>A smarter way to compare</h3><p>Compare the final checkout price, delivery charges, seller ratings and return policy. A headline discount alone doesn’t tell the whole story.</p></div> : null}
    </Dialog>
  </>;
}



