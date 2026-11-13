"use client";

import {
  Bell,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  Heart,
  House,
  Menu,
  MessagesSquare,
  PlusCircle,
  Store,
  Tag,
  UserRound,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { UserNamePrompt } from "@/features/customer/IdentityCard";
import { BrandLogo } from "@/components/BrandLogo";
import type { DealFilters } from "@/features/deals/types";

export type Panel = "saved" | "stores" | "account" | "notifications" | "blog" | "bank" | null;

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

export function Header({
  onPanel,
  onView,
  onHome,
  onCategory,
  categories = [],
  savedCount,
  communityEnabled = false,
}: {
  onPanel: (panel: Panel) => void;
  onView: (view: DealFilters["view"]) => void;
  onHome: () => void;
  onCategory?: (categorySlug: string) => void;
  categories?: CategoryItem[];
  savedCount: number;
  communityEnabled?: boolean;
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/customer/session", { cache: "no-store" }).then((r) => r.json()).then((s) => { if (alive) setSignedIn(Boolean(s?.user)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryDetailsRef = useRef<HTMLDetailsElement>(null);
  const categoryHoverTimer = useRef<NodeJS.Timeout | null>(null);

  const closeMenu = () => {
    setMobileOpen(false);
    setIsCategoryOpen(false);
    if (categoryDetailsRef.current) {
      categoryDetailsRef.current.removeAttribute("open");
    }
  };

  const parentCategories = categories.filter((c) => !c.parentId);
  const currentSubcategories = activeParentId
    ? categories.filter((c) => c.parentId === activeParentId)
    : [];
  const activeParent = parentCategories.find((p) => p.id === activeParentId);

  const handleMouseEnterNav = () => {
    if (categoryHoverTimer.current) clearTimeout(categoryHoverTimer.current);
    setIsCategoryOpen(true);
    if (categoryDetailsRef.current) {
      categoryDetailsRef.current.setAttribute("open", "true");
    }
    if (!activeParentId && parentCategories.length > 0) {
      setActiveParentId(parentCategories[0].id);
    }
  };

  const handleMouseLeaveNav = () => {
    categoryHoverTimer.current = setTimeout(() => {
      setIsCategoryOpen(false);
      if (categoryDetailsRef.current) {
        categoryDetailsRef.current.removeAttribute("open");
      }
    }, 250);
  };

  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape") closeMenu();
      }}
    >
      <a className="skip-link" href="#main">
        Skip to deals
      </a>
      <div className="header-inner">
        <BrandLogo onClick={() => { onHome(); closeMenu(); }} />

        <nav
          aria-label="Main navigation"
          className={`main-nav ${mobileOpen ? "is-open" : ""}`}
          id="main-navigation"
        >
          <Link
            className="nav-home"
            href="/"
            onClick={() => {
              onHome();
              closeMenu();
            }}
          >
            <House size={19} fill="currentColor" />
            Home
          </Link>

          {/* Deals dropdown */}
          <details className="nav-dropdown">
            <summary>
              <Tag size={19} />
              Deals
              <ChevronDown size={14} />
            </summary>
            <div className="nav-dropdown-menu">
              {(
                [
                  ["top", "Today's top deals"],
                  ["featured", "Featured deals"],
                  ["latest", "Latest deals"],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  onClick={(event) => {
                    onView(view);
                    closeMenu();
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>

          {/* Categories 2-level cascading Flyout Menu (Hover & Click) */}
          <details
            ref={categoryDetailsRef}
            className="nav-dropdown categories-mega-dropdown"
            open={isCategoryOpen}
            onMouseEnter={handleMouseEnterNav}
            onMouseLeave={handleMouseLeaveNav}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                const nextState = !isCategoryOpen;
                setIsCategoryOpen(nextState);
                if (nextState && !activeParentId && parentCategories.length > 0) {
                  setActiveParentId(parentCategories[0].id);
                }
              }}
            >
              <Grid2X2 size={19} />
              Categories
              <ChevronDown size={14} />
            </summary>

            <div className="categories-cascading-panel">
              {/* Left Column: Main Categories */}
              <div className="categories-parent-column">
                <div className="categories-column-header">Main Categories</div>
                <div className="categories-scroll-list">
                  {parentCategories.map((parent) => {
                    const hasSub = categories.some((c) => c.parentId === parent.id);
                    const isSelected = activeParentId === parent.id;
                    return (
                      <div
                        key={parent.id}
                        className={`category-parent-row ${isSelected ? "is-selected" : ""}`}
                        onMouseEnter={() => setActiveParentId(parent.id)}
                        onClick={() => setActiveParentId(parent.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isSelected}
                      >
                        <span className="category-parent-title">{parent.name}</span>
                        {hasSub && <ChevronRight size={14} className="category-chevron-icon" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Subcategories */}
              <div className="categories-sub-column">
                <div className="categories-column-header">
                  {activeParent
                    ? `${activeParent.name} Subcategories`
                    : "Subcategories"}
                </div>
                <div className="categories-scroll-list">
                  {activeParent && (
                    <button
                      type="button"
                      className="category-all-link"
                      onClick={() => {
                        if (onCategory) {
                          onCategory(activeParent.slug);
                          closeMenu();
                        }
                      }}
                    >
                      <span>Explore all in {activeParent.name}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                  {currentSubcategories.length === 0 ? (
                    <div className="category-empty-sub">No subcategories available</div>
                  ) : (
                    currentSubcategories.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className="category-sub-row"
                        onClick={() => {
                          if (onCategory) {
                            onCategory(sub.slug);
                            closeMenu();
                          }
                        }}
                      >
                        {sub.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </details>

          <button
            onClick={() => {
              onPanel("stores");
              closeMenu();
            }}
          >
            <Store size={19} />
            Stores
          </button>
          {communityEnabled && (
            <Link href="/community" onClick={closeMenu}>
              <MessagesSquare size={19} />
              Forum
            </Link>
          )}
          {signedIn && (
            <Link href="/post-deal" onClick={closeMenu}>
              <PlusCircle size={19} />
              Post a Deal
            </Link>
          )}
        </nav>

        {signedIn && <UserNamePrompt />}
        <div className="header-actions">
          <button
            className="icon-button notification-button"
            aria-label="Notifications"
            onClick={() => onPanel("notifications")}
          >
            <Bell size={23} />
            <span className="notification-dot" />
          </button>
          <button
            className="icon-button"
            aria-label={`Saved deals (${savedCount})`}
            onClick={() => onPanel("saved")}
          >
            <Heart size={23} />
            {savedCount > 0 && <span className="saved-count">{savedCount}</span>}
          </button>
          <div className="account-menu">
            <button
              className="icon-button account-button"
              aria-label="Your account"
              aria-haspopup={signedIn ? "menu" : undefined}
              onClick={() => onPanel("account")}
            >
              <UserRound size={22} />
            </button>
            {signedIn && (
              <div className="account-menu-panel" role="menu" aria-label="Account menu">
                <Link href="/account" role="menuitem">Manage Profile</Link>
                <Link href="/post-deal#my-submissions" role="menuitem">Submitted Deals</Link>
                <button type="button" role="menuitem" onClick={() => void signOut({ callbackUrl: "/" })}>Logout</button>
              </div>
            )}
          </div>
          <button
            className="icon-button menu-toggle"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="main-navigation"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu size={23} />
          </button>
        </div>
      </div>
    </header>
  );
}
