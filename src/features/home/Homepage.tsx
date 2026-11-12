"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import type { Deal, DealFilters } from "@/features/deals/types";


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

export function Homepage({
  deals: initialDeals,
  initialCursor,
  initialCatalog,
  communityEnabled = false,
}: {
  deals: Deal[];
  initialCursor: string | null;
  communityEnabled?: boolean;
  initialCatalog?: {
    categories: { id: string; slug: string; name: string; parentId?: string | null }[];
    merchants: { id: string; slug: string; name: string }[];
  };
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [catalog, setCatalog] = useState(initialCatalog ?? { categories: [], merchants: [] });
  const sentinel = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState(defaults);
  const [query, setQuery] = useState("");
  const isInitialMount = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState("");
  const saved = useSavedDeals();
  const router = useRouter();

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
      limit: "15",
    });

    fetch(`/api/v1/home-deals?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Deals could not be loaded. Please retry.");
        return res.json();
      })
      .then((result) => {
        setDeals(result.data || []);
        setNextCursor(result.nextCursor ?? null);
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
  }, [filters]);

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

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMoreRef.current || isSearching) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        q: filters.query,
        category: filters.category,
        store: filters.store,
        view: filters.view,
        limit: "15",
        cursor: nextCursor,
      });
      const res = await fetch(`/api/v1/home-deals?${params}`);
      if (!res.ok) throw new Error("Could not load more deals.");
      const result = await res.json();
      setDeals((prev) => [...new Map([...prev, ...(result.data || [])].map((d) => [d.id, d])).values()]);
      setNextCursor(result.nextCursor ?? null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load more deals.");
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [filters, nextCursor, isSearching]);

  useEffect(() => {
    if (!nextCursor || isLoadingMore || isSearching || loadError || !sentinel.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "150px" }
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [nextCursor, isLoadingMore, isSearching, loadError, loadMore]);

  const scrollToDeals = () => {
    const el = document.getElementById("top-deals") || document.getElementById("deals-showcase");
    if (el) {
      const yOffset = -70;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  };

  const reset = () => {
    setFilters(defaults);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const search = (text: string) => {
    const trimmed = text.trim();
    setQuery(trimmed);
    setFilters({ ...defaults, query: trimmed });
    setTimeout(() => scrollToDeals(), 50);
  };

  const chooseStore = (store: string) => {
    setFilters({ ...defaults, store });
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
    <Header communityEnabled={communityEnabled} categories={catalog.categories} onCategory={(cat) => { setFilters({ ...defaults, category: cat }); setQuery(""); scrollToDeals(); }} savedCount={saved.ids.filter((id) => deals.some((deal) => deal.id === id)).length} onHome={() => { setFilters(defaults); setQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onPanel={(next)=>{if(next==="account")router.push("/account");else setPanel(next);}} onView={(view) => { setFilters({ ...defaults, view }); setQuery(""); scrollToDeals(); }} />
    <main id="main">
      <HeroSection query={query} onQuery={setQuery} onSearch={search} />
      <CategorySection
        items={
          mainCategories.length
            ? mainCategories.map((c) => ({
                id: c.slug,
                label: c.name,
                icon: categories.find((x) => x.id === c.slug)?.icon ?? "◇",
              }))
            : categories
        }
        selected={filters.category}
        onSelect={(category) => {
          setFilters({ ...defaults, category });
          setQuery("");
          scrollToDeals();
        }}
      />
      <div className="deals-showcase" id="deals-showcase">
        {filters.view === "featured" ? <FeaturedDeals {...sectionProps} /> : filters.view === "latest" ? <LatestDeals {...sectionProps} /> : <TopDealsSection {...sectionProps} />}
        <div className="page-container" ref={sentinel} aria-live="polite">
          {deals.some((d) => d.source === "demo") && <p>{deals.length} sample deals loaded</p>}
          {isSearching ? (
            <p>Searching deals…</p>
          ) : isLoadingMore ? (
            <p>Loading more deals…</p>
          ) : loadError ? (
            <p role="alert">
              {loadError} <button onClick={() => void loadMore()}>Retry</button>
            </p>
          ) : nextCursor ? (
            <button onClick={() => void loadMore()}>Load more deals</button>
          ) : deals.length > 0 ? (
            <p>All available results shown.</p>
          ) : null}
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



