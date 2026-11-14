"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { notificationText, type NotificationType } from "../notification-text";
import { ago } from "./parts";
import styles from "../community.module.css";

type Item = { id: string; type: NotificationType; postSlug: string; postTitle: string; commentId: string | null; actor: string | null; read: boolean; createdAt: string };

/** Bell with the unread count and the member's latest notices. Polls once a minute while the tab is visible. */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]), [unread, setUnread] = useState(0), [open, setOpen] = useState(false), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // One loader used by the first load, the minute timer and opening the panel; state is only set after the answer arrives.
  const load = useCallback(() => fetch("/api/v1/community/notifications", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) { if (r.status !== 401) setFailed(true); return; }
      const body = await r.json(); setItems(body.data.items); setUnread(body.data.unread); setFailed(false);
    })
    .catch(() => setFailed(true))
    .finally(() => setLoaded(true)), []);

  useEffect(() => {
    const first = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function markRead(ids?: string[]) {
    await fetch("/api/v1/community/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) }).catch(() => {});
  }
  async function openItem(n: Item) {
    setOpen(false);
    if (!n.read) { setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((u) => Math.max(0, u - 1)); void markRead([n.id]); }
    router.push(n.type === "MODERATION_WARNING" || n.type === "POSTING_RESTRICTED" || n.type === "APPEAL_DECIDED" ? "/community/moderation" : n.type === "MESSAGE" ? `/messages?t=${n.postSlug}` : n.type === "ANNOUNCEMENT" ? `/community/announcements/${n.postSlug}` : `/community/post/${n.postSlug}${n.commentId ? `#c-${n.commentId}` : ""}`);
  }

  return (
    <div className={styles.bellWrap} ref={wrap}>
      <button type="button" className={styles.bell} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((v) => !v); if (!open) void load(); }}>
        <Bell size={20} />{unread > 0 && <span className={styles.bellDot}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className={styles.bellPanel} role="menu" aria-label="Notifications">
          <div className={styles.bellHead}><strong>Notifications</strong>{unread > 0 && <button type="button" onClick={() => { setItems((l) => l.map((x) => ({ ...x, read: true }))); setUnread(0); void markRead(); }}>Mark all as read</button>}</div>
          {!loaded ? <p className={styles.bellEmpty}>Loading…</p> : failed ? <p className={styles.bellEmpty}>Could not load notifications.</p> : items.length === 0 ? <p className={styles.bellEmpty}>You are all caught up. Replies to your discussions and comments will show up here.</p> : (
            <ul>
              {items.map((n) => (
                <li key={n.id}><button type="button" role="menuitem" className={n.read ? "" : styles.bellUnread} onClick={() => void openItem(n)}><span>{notificationText(n.type, n.actor)}</span><em>{n.postTitle}</em><small>{ago(n.createdAt)}</small></button></li>
              ))}
            </ul>
          )}
          <Link href="/community/me" className={styles.bellFoot} onClick={() => setOpen(false)}>My activity</Link>
        </div>
      )}
    </div>
  );
}
