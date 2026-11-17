"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
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
import styles from "./admin-nav.module.css";

type AdminUser = { name: string | null; email: string | null; role: string };

type NavLink = { href: string; label: string; Icon: typeof Gauge; match: (path: string) => boolean };

const dealLinks: NavLink[] = [
  { href: "/admin/deals", label: "Deal Management", Icon: Tag, match: (path) => path.startsWith("/admin/deals") },
  { href: "/admin/intelligence", label: "Deal Intelligence", Icon: BarChart3, match: (path) => path.startsWith("/admin/intelligence") },
  { href: "/admin/scraper", label: "Deal Scraper", Icon: Zap, match: (path) => path.startsWith("/admin/scraper") },
];

const navLinks: NavLink[] = [
  { href: "/admin/cuelinks", label: "Affiliate", Icon: Link2, match: (path) => path.startsWith("/admin/cuelinks") },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, match: (path) => path.startsWith("/admin/analytics") },
];

const communityLinks = [
  { href: "/admin/submissions", label: "Community Deals" },
  { href: "/admin/community", label: "Community Management" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/moderators", label: "Moderators" },
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
  const bellRef = useRef<HTMLDivElement>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<{ pendingSubmissions: number; items: { id: string; title: string; submittedAt: string; resubmitted: boolean }[] }>({ pendingSubmissions: 0, items: [] });
  const pending = notes.pendingSubmissions;
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
    let alive = true;
    const load = () => { if (!document.hidden) void fetch("/api/v1/admin/notifications", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((r) => { if (alive && r?.data) setNotes(r.data); }).catch(() => undefined); };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (event: PointerEvent) => { if (event.target instanceof Node && !bellRef.current?.contains(event.target)) setBellOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setBellOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [bellOpen]);

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
  const activeMore = pathname === "/";
  const displayName = user?.name?.trim() || user?.email || "Administrator";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className={styles.adminChrome}>
      <header className={styles.brandHeader}>
        <div className={styles.brandRow}>
          <div className={styles.brandCluster}>
            <BrandLogo />
            <span className={styles.version}>v2.5</span>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.bellWrap} ref={bellRef}>
              <button className={styles.notificationLink} type="button" aria-label={`Notifications${pending ? `, ${pending} waiting` : ""}`} aria-expanded={bellOpen} aria-haspopup="dialog" onClick={() => setBellOpen((open) => !open)}>
                <Bell size={22} aria-hidden="true" />
                {pending > 0 && <span className={styles.bellBadge}>{pending > 99 ? "99+" : pending}</span>}
              </button>
              {bellOpen && (
                <div className={styles.bellPanel} role="dialog" aria-label="Notifications">
                  <strong>Notifications</strong>
                  {notes.items.length === 0 && <p className={styles.bellEmpty}>Nothing waiting for review.</p>}
                  {notes.items.map((item) => (
                    <Link key={item.id} href="/admin/submissions" className={styles.bellItem} onClick={() => setBellOpen(false)}>
                      <span>{item.resubmitted ? "Resubmitted deal" : "New deal submitted"}</span>
                      <b>{item.title}</b>
                      <small>{new Date(item.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}</small>
                    </Link>
                  ))}
                  {pending > 0 && <Link href="/admin/submissions" className={styles.bellAll} onClick={() => setBellOpen(false)}>Review all {pending} awaiting</Link>}
                  {user?.role === "SUPER_ADMIN" && <Link href="/admin#audit-heading" className={styles.bellAll} onClick={() => setBellOpen(false)}>Recent audit activity</Link>}
                </div>
              )}
            </div>
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
      </header>

      <nav ref={navigationRef} className={`${styles.navigation} ${mobileOpen ? styles.navigationOpen : ""}`} aria-label="Admin navigation">
        <div className={styles.navigationInner}>
          <Link className={linkClass(pathname === "/admin")} href="/admin" onClick={closeNavigation} aria-current={pathname === "/admin" ? "page" : undefined}>
            <Shield size={19} aria-hidden="true" /><span>Admin</span>
          </Link>
          <details className={`${styles.navGroup} ${dealLinks.some((l) => l.match(pathname)) ? styles.navGroupActive : ""}`}>
            <summary aria-label="Deals menu"><Tag size={19} aria-hidden="true" /><span>Deals</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.navDropdown}>
              {dealLinks.map(({ href, label, match }) => <Link key={href} href={href} onClick={closeNavigation} aria-current={match(pathname) ? "page" : undefined}>{label}</Link>)}
            </div>
          </details>
          <details className={`${styles.navGroup} ${pathname.startsWith("/admin/categories") ? styles.navGroupActive : ""}`}>
            <summary aria-label="Categories menu"><FolderOpen size={19} aria-hidden="true" /><span>Categories</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.navDropdown}><Link href="/admin/categories" onClick={closeNavigation}>Category Management</Link></div>
          </details>
          <details className={`${styles.navGroup} ${pathname.startsWith("/admin/merchant-websites") ? styles.navGroupActive : ""}`}>
            <summary aria-label="Merchants menu"><Store size={19} aria-hidden="true" /><span>Merchants</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.navDropdown}><Link href="/admin/merchant-websites" onClick={closeNavigation}>Merchant Websites</Link></div>
          </details>
          {navLinks.map(({ href, label, Icon, match }) => (
            <Link key={href} className={linkClass(match(pathname))} href={href} onClick={closeNavigation} aria-current={match(pathname) ? "page" : undefined}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
          <details className={`${styles.navGroup} ${activeCommunity ? styles.navGroupActive : ""}`}>
            <summary aria-label="Community administration menu"><Users size={19} aria-hidden="true" /><span>Community Deals</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.navDropdown}>
              {communityLinks.map((item) => <Link key={item.href} href={item.href} onClick={closeNavigation}>{item.label}</Link>)}
            </div>
          </details>
          <details className={`${styles.navGroup} ${activeMore ? styles.navGroupActive : ""}`}>
            <summary aria-label="More administration links"><Menu size={19} aria-hidden="true" /><span>More</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.navDropdown}>
              <Link href="/" onClick={closeNavigation}><ExternalLink size={15} /> MetaDeals4U website</Link>
            </div>
          </details>
        </div>
      </nav>
      {dealLinks.some((l) => l.match(pathname)) && (
        <div className={styles.dealTabs} role="tablist" aria-label="Deals sections">
          {dealLinks.map(({ href, label, Icon, match }) => (
            <Link key={href} href={href} role="tab" aria-selected={match(pathname)} className={`${styles.dealTab} ${match(pathname) ? styles.dealTabActive : ""}`}>
              <Icon size={16} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
