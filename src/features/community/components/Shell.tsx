import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../community.module.css";

export function CommunityShell({ active, children }: { active?: "feed" | "submit" | "me"; children: ReactNode }) {
  const link = (href: string, key: string, label: string) => (
    <Link href={href} className={`${styles.navLink} ${active === key ? styles.navLinkActive : ""}`}>{label}</Link>
  );
  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Community">
        <Link href="/community" className={styles.brand}>MetaDeals4U Community</Link>
        <div className={styles.navLinks}>
          {link("/community", "feed", "Posts")}
          {link("/community/submit", "submit", "New post")}
          {link("/community/me", "me", "My activity")}
          <Link href="/" className={styles.navLink}>Official deals</Link>
        </div>
      </nav>
      {children}
    </main>
  );
}
