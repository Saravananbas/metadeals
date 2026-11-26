import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { communityPageViewer } from "@/server/community/session";
import { viewerHandle } from "@/server/community/service";
import { getDatabase } from "@/server/db/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Avatar } from "./parts";
import { NotificationBell } from "./NotificationBell";
import { MessagesLink } from "@/features/messages/MessagesLink";
import styles from "../community.module.css";

// The main shop categories rarely change, so they are looked up at most once a minute per server.
let cache: { at: number; list: { slug: string; name: string }[] } | null = null;
async function mainCategories() {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const rows = await getDatabase().category.findMany({ where: { parentId: null }, orderBy: { name: "asc" }, select: { slug: true, name: true } });
  // A community exists for each category under this shortened address.
  const list = rows.map((c) => ({ slug: c.slug.slice(0, 40).replace(/-+$/, ""), name: c.name })).filter((c) => c.slug.length >= 2);
  cache = { at: Date.now(), list };
  return list;
}

/** Top bar for every community page: logo, links that exist today, categories, search, notifications and the signed-in member's menu. */
export async function CommunityShell({ active, children, q }: { active?: "feed" | "submit" | "me"; children: ReactNode; q?: string }) {
  const customerId = await communityPageViewer();
  const [handle, categories] = await Promise.all([customerId ? viewerHandle(customerId).catch(() => null) : null, mainCategories().catch(() => [])]);
  const link = (href: string, key: string, label: string) => (
    <Link href={href} className={`${styles.navLink} ${active === key ? styles.navLinkActive : ""}`}>{label}</Link>
  );
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.logoWrap}><BrandLogo /></div>
          <nav className={styles.navLinks} aria-label="Community">
            {link("/community", "feed", "Community")}
            <Link href="/" className={styles.navLink}>Deals</Link>
            {categories.length > 0 && (
              <details className={styles.catMenu}>
                <summary className={styles.navLink}>Categories <ChevronDown size={14} aria-hidden /></summary>
                <div className={styles.catPanel}>
                  <Link href="/community">All discussions</Link>
                  {categories.map((c) => <Link key={c.slug} href={`/community/c/${c.slug}`}>{c.name}</Link>)}
                </div>
              </details>
            )}
            {link("/community/submit", "submit", "New discussion")}
          </nav>
          <form className={styles.navSearch} action="/community" role="search">
            <input name="q" defaultValue={q ?? ""} maxLength={80} placeholder="Search discussions" aria-label="Search discussions" />
            <button type="submit" aria-label="Search">⌕</button>
          </form>
          {customerId && <MessagesLink className={styles.bell} badgeClassName={styles.bellDot} />}
          {customerId && <NotificationBell />}
          {handle ? (
            <details className={styles.userMenu}>
              <summary aria-label="Your menu"><Avatar handle={handle.handle} url={handle.avatarUrl} size={34} /></summary>
              <div className={styles.menuPanel}>
                <strong>{handle.handle}</strong>
                <Link href="/account">My profile</Link>
                <Link href="/account?tab=activity">My activity</Link>
                <Link href="/community?view=mine">My discussions</Link>
                <Link href="/community?view=saved">Saved posts</Link>
                <Link href="/account?tab=settings">Settings &amp; Security</Link>
              </div>
            </details>
          ) : (
            <Link href="/account" className={styles.signIn}>{customerId ? "Account" : "Sign in"}</Link>
          )}
        </div>
      </header>
      <main className={styles.shell}>{children}</main>
    </div>
  );
}
