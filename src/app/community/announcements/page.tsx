import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CommunityShell } from "@/features/community/components/Shell";
import { OfficialBadge } from "@/features/community/components/OfficialBadge";
import { listPublicAnnouncements } from "@/server/community/announcements";
import { communityPageViewer } from "@/server/community/session";
import styles from "@/features/community/detail.module.css";
import community from "@/features/community/community.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Official announcements | MetaDeals4U Community" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await communityPageViewer();
  const page = Math.max(1, Math.min(200, Number((await searchParams).page) || 1));
  const { items, total } = await listPublicAnnouncements(10, page);
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <CommunityShell>
      <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/community">Community</Link><ChevronRight size={14} aria-hidden /><span className={styles.crumbCurrent} aria-current="page">Announcements</span></nav>
      <h1 style={{ margin: 0, fontSize: 22 }}>Official announcements</h1>
      {items.length === 0 ? <div className={`${styles.card} ${styles.empty}`}>No announcements yet.</div> : items.map((a) => (
        <article key={a.slug} className={styles.card}>
          <h2 style={{ margin: "0 0 6px", fontSize: 18 }}><Link href={`/community/announcements/${a.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{a.title}</Link></h2>
          <div className={community.annMeta}><OfficialBadge /> {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}</div>
          <p style={{ margin: "8px 0 0", color: "var(--md-c-3a3660)" }}>{a.body.length > 240 ? a.body.slice(0, 240) + "…" : a.body}</p>
        </article>
      ))}
      {pages > 1 && <p style={{ display: "flex", gap: 12 }}>{page > 1 && <Link href={`/community/announcements?page=${page - 1}`}>‹ Newer</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={`/community/announcements?page=${page + 1}`}>Older ›</Link>}</p>}
    </CommunityShell>
  );
}
