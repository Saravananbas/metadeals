"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Heart,
  Tag,
  Grid2X2,
  Sparkles,
  Smartphone,
  Laptop,
  Tv,
  Shirt,
  Utensils,
  Plane,
  MoreHorizontal,
} from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";
import { useSavedDeals } from "@/features/home/saved-store";
import { BrandLogo } from "@/components/BrandLogo";

const CATEGORIES = [
  { name: "Today's Top Deals", href: "/?view=top", icon: Sparkles },
  { name: "Electronics", href: "/?category=electronics", icon: Tag },
  { name: "Mobiles", href: "/?category=mobiles", icon: Smartphone },
  { name: "Laptops", href: "/?category=laptops", icon: Laptop },
  { name: "TVs & Appliances", href: "/?category=tvs-appliances", icon: Tv },
  { name: "Fashion", href: "/?category=fashion", icon: Shirt },
  { name: "Home & Kitchen", href: "/?category=home-kitchen", icon: Utensils },
  { name: "Travel", href: "/?category=travel", icon: Plane },
  { name: "More", href: "/#categories", icon: MoreHorizontal },
];

export function DealNavbar({ currentCategorySlug }: { currentCategorySlug?: string }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const saved = useSavedDeals();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--md-white)" }}>
      {/* Main Top Header */}
      <div
        style={{
          borderBottom: "1px solid var(--md-color-border, var(--md-color-border))",
          background: "color-mix(in srgb, var(--md-white) 95%, transparent)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className={styles.container}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            padding: "10px 20px",
          }}
        >
          {/* Brand Logo */}
          <BrandLogo />

          {/* Search Bar */}
          <form
            onSubmit={handleSearch}
            style={{
              flex: 1,
              maxWidth: 520,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--md-color-surface-muted)",
              borderRadius: 9999,
              padding: "6px 16px",
              border: "1px solid var(--md-color-border)",
            }}
          >
            <Search size={18} color="var(--md-color-text-secondary)" />
            <input
              type="text"
              placeholder="Search verified deals, brands, mobiles, laptops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                width: "100%",
                fontSize: 13,
                color: "var(--md-color-text)",
              }}
            />
          </form>

          {/* Header Action Links */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link
              href="/#deals"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                color: "var(--md-color-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Tag size={16} /> Deals
            </Link>
            <Link
              href="/#categories"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                color: "var(--md-color-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Grid2X2 size={16} /> Categories
            </Link>
            <Link
              href="/?view=top"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                color: "var(--md-color-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
              }}
              title="Saved Deals"
            >
              <Heart size={18} />
              {saved.ids.length > 0 && (
                <span
                  style={{
                    background: "var(--md-red-600)",
                    color: "var(--md-white)",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 9999,
                  }}
                >
                  {saved.ids.length}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Purple Category Navigation Bar */}
      <nav className={styles.categoryBar} aria-label="Category navigation">
        <div className={styles.categoryBarInner}>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = currentCategorySlug
              ? cat.href.includes(currentCategorySlug.toLowerCase())
              : false;
            return (
              <Link
                key={cat.name}
                href={cat.href}
                className={`${styles.categoryLink} ${isActive ? styles.categoryLinkActive : ""}`}
              >
                <Icon size={14} />
                <span>{cat.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

