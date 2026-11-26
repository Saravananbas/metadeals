"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Mail, MessagesSquare, Plus, SquarePen, UserRound } from "lucide-react";
import { useUnreadMessages } from "./useUnread";
import styles from "./tabbar.module.css";

const inApp = () => navigator.userAgent.includes("MetaDeals4UApp");
const noSubscribe = () => () => {};

/** Home, + Deal (post a deal), Community, Inbox, Profile: phone widths only. Saved deals stay reachable from the heart icon on the deals page. */
export function MobileTabBar({ community = true }: { community?: boolean }) {
  const path = usePathname() ?? "/";
  const unread = useUnreadMessages();
  const hidden = useSyncExternalStore(noSubscribe, inApp, () => false);
  if (hidden || path.startsWith("/admin") || path.startsWith("/moderator")) return null;
  const tabs = [
    { href: "/", label: "Home", icon: House, on: path === "/" },
    { href: "/post-deal", label: "Deal", icon: Plus, on: path.startsWith("/post-deal") },
    ...(community ? [{ href: "/community/submit", label: "Post", icon: SquarePen, on: path.startsWith("/community/submit") }] : []),
    ...(community ? [{ href: "/community", label: "Community", icon: MessagesSquare, on: path.startsWith("/community") && !path.startsWith("/community/u/") && !path.startsWith("/community/submit") }] : []),
    { href: "/messages", label: "Inbox", icon: Mail, on: path.startsWith("/messages"), badge: unread ?? 0 },
    { href: "/profile", label: "Profile", icon: UserRound, on: path.startsWith("/community/u/") || path.startsWith("/account") },
  ];
  return (
    <>
      <div className={styles.spacer} aria-hidden />
      <nav className={styles.bar} aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(({ href, label, icon: Icon, on, badge }) => (
          <Link key={label} href={href} className={`${styles.tab} ${on ? styles.on : ""}`} aria-current={on ? "page" : undefined}>
            <Icon size={21} aria-hidden />{label}{badge ? <span className={styles.badge} aria-label={`${badge} unread`}>{badge > 9 ? "9+" : badge}</span> : null}
          </Link>
        ))}
      </nav>
    </>
  );
}
