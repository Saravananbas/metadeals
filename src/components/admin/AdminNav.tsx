"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Gauge,
  Link2,
  LogOut,
  Menu,
  Shield,
  Store,
  Tag,
  Users,
  X,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { can, type AdminRole, type Permission } from "@/server/auth/permissions";
import { NotificationCenter } from "./NotificationCenter";
import styles from "./admin-nav.module.css";

type AdminUser = { name: string | null; email: string | null; role: string; permissions?: string[] | null };

type NavLink = { href: string; label: string; Icon: typeof Gauge; match: (path: string) => boolean; needs: Permission[] };

const dealLinks: NavLink[] = [
  { href: "/admin/deals", label: "Deal Management", Icon: Tag, match: (path) => path.startsWith("/admin/deals"), needs: ["deal:edit"] },
  { href: "/admin/intelligence", label: "Deal Intelligence", Icon: BarChart3, match: (path) => path.startsWith("/admin/intelligence"), needs: ["intelligence:view"] },
  { href: "/admin/scraper", label: "Deal Scraper", Icon: Zap, match: (path) => path.startsWith("/admin/scraper"), needs: ["scraper:use"] },
];

const navLinks: NavLink[] = [
  { href: "/admin/cuelinks", label: "Affiliate", Icon: Link2, match: (path) => path.startsWith("/admin/cuelinks") || path.startsWith("/admin/affiliate"), needs: ["affiliate:view"] },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, match: (path) => path.startsWith("/admin/analytics"), needs: ["analytics:view"] },
  { href: "/admin/users", label: "Users", Icon: Users, match: (path) => path.startsWith("/admin/users"), needs: ["users:view"] },
];

// roleOnly: these follow the person's role even when their other access was set one by one.
const communityLinks: { href: string; label: string; needs: Permission[]; roleOnly?: boolean }[] = [
  { href: "/admin/submissions", label: "Community Deals", needs: ["mod:submission:review", "deal:publish"] },
  { href: "/admin/community", label: "Community Management", needs: ["forum:moderate"], roleOnly: true },
  { href: "/admin/announcements", label: "Announcements", needs: ["announcement.publish", "security:manage"], roleOnly: true },
  { href: "/admin/moderators", label: "Moderators", needs: ["mod:appoint"], roleOnly: true },
];

export function AdminNav(props: { active?: string; onSelectTab?: (tab: "deals" | "categories") => void }) {
  void props;
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ user: AdminUser | null }> : null)
      .then((result) => { if (result?.user) setUser(result.user); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) setProfileOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    function onNavigationPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        navigationRef.current?.querySelectorAll("details[open]").forEach((element) => element.removeAttribute("open"));
      }
    }
    function onNavigationKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") navigationRef.current?.querySelectorAll("details[open]").forEach((element) => element.removeAttribute("open"));
    }
    document.addEventListener("pointerdown", onNavigationPointerDown);
    document.addEventListener("keydown", onNavigationKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onNavigationPointerDown);
      document.removeEventListener("keydown", onNavigationKeyDown);
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  function linkClass(match: boolean) {
    return match ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;
  }

  function closeNavigation() {
    setMobileOpen(false);
    navigationRef.current?.querySelectorAll("details[open]").forEach((element) => element.removeAttribute("open"));
  }

  const activeCommunity = communityLinks.some((item) => pathname.startsWith(item.href));
  const displayName = user?.name?.trim() || user?.email || "Administrator";
  const initials = displayName.slice(0, 1).toUpperCase();
  // Until the session is known every link shows; the server refuses anything the person may not use.
  const subject = user ? { role: user.role as AdminRole, permissions: user.permissions ?? null } : null;
  const ok = (...perms: Permission[]) => !subject || perms.some((p) => can(subject, p));
  const visibleDealLinks = dealLinks.filter((l) => ok(...l.needs));
  const visibleNavLinks = navLinks.filter((l) => ok(...l.needs));
  const visibleCommunity = communityLinks.filter((l) => (l.roleOnly && subject ? l.needs.some((p) => can({ role: subject.role }, p)) : ok(...l.needs)));

  return (
    <div className={styles.adminChrome}>
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.brandCluster}>
            <BrandLogo />
            <span className={styles.version}>v2.5</span>
          </div>
        <nav ref={navigationRef} className={`${styles.navigation} ${mobileOpen ? styles.navigationOpen : ""}`} aria-label="Admin navigation">
          <div className={styles.navigationInner}>
            {ok("account:read") && (
              <Link className={linkClass(pathname === "/admin")} href="/admin" onClick={closeNavigation} aria-current={pathname === "/admin" ? "page" : undefined}>
                <Shield size={19} aria-hidden="true" /><span>Admin</span>
              </Link>
            )}
            {visibleDealLinks.length > 0 && <details className={`${styles.navGroup} ${dealLinks.some((l) => l.match(pathname)) ? styles.navGroupActive : ""}`}>
              <summary aria-label="Deals menu"><Tag size={19} aria-hidden="true" /><span>Deals</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className={styles.navDropdown}>
                {visibleDealLinks.map(({ href, label, match }) => <Link key={href} href={href} onClick={closeNavigation} aria-current={match(pathname) ? "page" : undefined}>{label}</Link>)}
              </div>
            </details>}
            {ok("deal:edit", "category:manage") && <details className={`${styles.navGroup} ${pathname.startsWith("/admin/categories") ? styles.navGroupActive : ""}`}>
              <summary aria-label="Categories menu"><FolderOpen size={19} aria-hidden="true" /><span>Categories</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className={styles.navDropdown}><Link href="/admin/categories" onClick={closeNavigation}>Category Management</Link></div>
            </details>}
            {ok("deal:edit", "merchant:manage") && <details className={`${styles.navGroup} ${pathname.startsWith("/admin/merchant-websites") ? styles.navGroupActive : ""}`}>
              <summary aria-label="Merchants menu"><Store size={19} aria-hidden="true" /><span>Merchants</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className={styles.navDropdown}><Link href="/admin/merchant-websites" onClick={closeNavigation}>Merchant Websites</Link></div>
            </details>}
            {visibleNavLinks.map(({ href, label, Icon, match }) => (
              <Link key={href} className={linkClass(match(pathname))} href={href} onClick={closeNavigation} aria-current={match(pathname) ? "page" : undefined}>
                <Icon size={19} aria-hidden="true" /><span>{label}</span>
              </Link>
            ))}
            {visibleCommunity.length > 0 && <details className={`${styles.navGroup} ${activeCommunity ? styles.navGroupActive : ""}`}>
              <summary aria-label="Community administration menu"><Users size={19} aria-hidden="true" /><span>Community Deals</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className={styles.navDropdown}>
                {visibleCommunity.map((item) => <Link key={item.href} href={item.href} onClick={closeNavigation}>{item.label}</Link>)}
              </div>
            </details>}
            <Link className={`${styles.navLink} ${styles.siteLink}`} href="/" onClick={closeNavigation} aria-label="Open the MetaDeals4U website" title="Open the MetaDeals4U website">
              <ExternalLink size={19} aria-hidden="true" /><span>MetaDeals4U</span>
            </Link>
          </div>
        </nav>
          <div className={styles.headerActions}>
            <NotificationCenter />
            <div className={styles.profileWrap} ref={profileRef}>
              <button
                className={styles.profileButton}
                type="button"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((open) => !open)}
              >
                <span className={styles.avatar} aria-hidden="true">{initials}</span>
                <span className={styles.profileText}>
                  <strong>{displayName}</strong>
                  <small>{user?.role?.replaceAll("_", " ") ?? "Admin"}</small>
                </span>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              {profileOpen && (
                <div className={styles.profileMenu} role="menu">
                  <div className={styles.profileMenuIdentity}>
                    <strong>{displayName}</strong>
                    {user?.email && <small>{user.email}</small>}
                  </div>
                  <Link href="/admin" role="menuitem" onClick={() => setProfileOpen(false)}>
                    <Shield size={16} /> Admin
                  </Link>
                  <button type="button" role="menuitem" onClick={() => void signOut()} disabled={signingOut}>
                    <LogOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
            <button
              className={styles.mobileMenuButton}
              type="button"
              aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>
      {dealLinks.some((l) => l.match(pathname)) && (
        <div className={styles.dealTabs} role="tablist" aria-label="Deals sections">
          {visibleDealLinks.map(({ href, label, Icon, match }) => (
            <Link key={href} href={href} role="tab" aria-selected={match(pathname)} className={`${styles.dealTab} ${match(pathname) ? styles.dealTabActive : ""}`}>
              <Icon size={16} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
