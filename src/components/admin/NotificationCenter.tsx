"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, PanelRightClose } from "lucide-react";
import styles from "./notification-center.module.css";

type Item = { id: string; title: string; at: string; note?: string; href: string };
type Group = { key: string; label: string; count: number; href: string; items: Item[] };
type Feed = { total: number; groups: Group[] };

const REFRESH_MS = 30_000;
const COLLAPSE_KEY = "md.admin.notify.collapsed";

function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
}

function Groups({ feed, now, onNavigate }: { feed: Feed; now: number; onNavigate?: () => void }) {
  return (
    <div className={styles.groups}>
      {feed.groups.map((group) => (
        <section key={group.key} className={`${styles.group} ${styles[`tone_${group.key}`] ?? ""}`} aria-label={group.label}>
          <Link href={group.href} className={styles.groupHead} onClick={onNavigate}>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={group.count ? styles.count : styles.countZero}>{group.count}</span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
          {group.count === 0 && <p className={styles.clear}>All clear</p>}
          {group.items.map((item) => (
            <Link key={item.id} href={item.href} className={styles.item} onClick={onNavigate}>
              <b>{item.title}</b>
              <span>{item.note && <em>{item.note}</em>}{ago(item.at, now)}</span>
            </Link>
          ))}
          {group.count > group.items.length && <Link href={group.href} className={styles.more} onClick={onNavigate}>See all {group.count}</Link>}
        </section>
      ))}
    </div>
  );
}

/** Always-visible notification panel on wide screens (right side), and a bell with the same list on tablets and phones. */
export function NotificationCenter() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const total = feed?.total ?? 0;
  const show = Boolean(feed && feed.groups.length > 0);

  useEffect(() => {
    // Reading the saved choice after mount keeps server and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      void fetch("/api/v1/admin/notifications", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => { if (alive && r?.data) { setFeed(r.data); setNow(Date.now()); } })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, []);

  // The page content makes room for the panel through a class on <body>; see notification-center.module.css.
  useEffect(() => {
    const cls = document.body.classList;
    cls.toggle("md-notify-dock", show && !collapsed);
    cls.toggle("md-notify-rail", show && collapsed);
    return () => { cls.remove("md-notify-dock", "md-notify-rail"); };
  }, [show, collapsed]);

  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e: PointerEvent) => { if (e.target instanceof Node && !bellRef.current?.contains(e.target)) setBellOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBellOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [bellOpen]);

  function toggle() {
    setCollapsed((value) => { localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1"); return !value; });
  }

  if (!show || !feed) return null;
  const badge = total > 0 ? <span className={styles.badge}>{total > 99 ? "99+" : total}</span> : null;

  return (
    <>
      <div className={styles.bellWrap} ref={bellRef}>
        <button type="button" className={styles.bell} aria-label={`Notifications${total ? `, ${total} waiting` : ""}`} aria-expanded={bellOpen} onClick={() => setBellOpen((o) => !o)}>
          <Bell size={22} aria-hidden="true" />{badge}
        </button>
        {bellOpen && (
          <div className={styles.popover} role="dialog" aria-label="Notifications">
            <strong>Notifications</strong>
            <Groups feed={feed} now={now} onNavigate={() => setBellOpen(false)} />
          </div>
        )}
      </div>

      <aside className={`${styles.dock} ${collapsed ? styles.dockCollapsed : ""}`} aria-label="Notifications">
        {collapsed ? (
          <button type="button" className={styles.rail} onClick={toggle} aria-label={`Open notifications${total ? `, ${total} waiting` : ""}`}>
            <Bell size={22} aria-hidden="true" />{badge}
          </button>
        ) : (
          <>
            <header className={styles.dockHead}>
              <h2>Notifications {badge}</h2>
              <button type="button" onClick={toggle} aria-label="Hide notifications panel"><PanelRightClose size={18} aria-hidden="true" /></button>
            </header>
            <div className={styles.dockBody}><Groups feed={feed} now={now} /></div>
            <footer className={styles.dockFoot}>Updated {ago(new Date(now).toISOString(), now)} · refreshes every 30 s</footer>
          </>
        )}
      </aside>
    </>
  );
}
