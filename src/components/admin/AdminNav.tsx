import Link from "next/link";
import styles from "./admin-nav.module.css";

export type AdminActiveNav =
  | "deals"
  | "categories"
  | "merchants"
  | "scraper"
  | "affiliate"
  | "analytics"
  | "submissions"
  | "community"
  | "account"
  | "intelligence"
  | "home";

interface AdminNavProps {
  active?: AdminActiveNav;
  /**
   * If on the Deals page where Deal Management and Categories & Stores
   * act as view-switching tabs, provide onSelectTab.
   */
  onSelectTab?: (tab: "deals" | "categories") => void;
}

export function AdminNav({ active }: AdminNavProps) {
  return (
    <div className={styles.topNavWrapper}>
      <div className={styles.topNavButtons} role="navigation" aria-label="Admin Navigation">
        <Link
          href="/admin/intelligence"
          className={active === "intelligence" ? styles.navButtonActive : styles.navButtonLink}
          aria-current={active === "intelligence" ? "page" : undefined}
        >
          🤖 Deal Intelligence
        </Link>

        {/* 1. Deal Management */}
        <Link
          href="/admin/deals"
          className={active === "deals" ? styles.navButtonActive : styles.navButtonLink}
        >
          🏷️ Deal Management
        </Link>

        {/* 2. Categories */}
        <Link
          href="/admin/categories"
          className={active === "categories" ? styles.navButtonActive : styles.navButtonLink}
        >
          📁 Categories
        </Link>

        {/* 3. Merchant Websites */}
        <Link
          href="/admin/merchant-websites"
          className={active === "merchants" ? styles.navButtonActive : styles.navButtonLink}
        >
          🌐 Merchant Websites
        </Link>

        {/* 4. Deal Scraper */}
        <Link
          href="/admin/scraper"
          className={active === "scraper" ? styles.navButtonActive : styles.navButtonLink}
        >
          ⚡ Deal Scraper
        </Link>

        {/* 5. Affiliate Dashboard */}
        <Link
          href="/admin/cuelinks"
          className={active === "affiliate" ? styles.navButtonActive : styles.navButtonLink}
        >
          🔗 Affiliate Dashboard
        </Link>

        <Link
          href="/admin/analytics"
          className={active === "analytics" ? styles.navButtonActive : styles.navButtonLink}
        >
          📈 Analytics
        </Link>

        <Link
          href="/admin/submissions"
          className={active === "submissions" ? styles.navButtonActive : styles.navButtonLink}
        >
          📝 Community Deals
        </Link>

        <Link
          href="/admin/community"
          className={active === "community" ? styles.navButtonActive : styles.navButtonLink}
        >
          💬 Community
        </Link>

        {/* 6. Account Management */}
        <Link
          href="/admin"
          className={active === "account" ? styles.navButtonActive : styles.navButtonLink}
        >
          ⚙️ Account Management
        </Link>

        {/* 7. Metadeals4u */}
        <Link
          href="/"
          className={active === "home" ? styles.navButtonActive : styles.navButtonLink}
        >
          🛍️ Metadeals4u
        </Link>
      </div>
    </div>
  );
}

