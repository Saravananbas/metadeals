import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CommunityShell } from "@/features/community/components/Shell";
import { OfficialBadge } from "@/features/community/components/OfficialBadge";
import { getPublicAnnouncement } from "@/server/community/announcements";
import { communityPageViewer } from "@/server/community/session";
import styles from "@/features/community/detail.module.css";
import community from "@/features/community/community.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Announcement | MetaDeals4U Community" };

export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  await communityPageViewer();
  const a = await getPublicAnnouncement((await params).slug);
  if (!a) notFound();
  return (
    <CommunityShell>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/community">Community</Link><ChevronRight size={14} aria-hidden /><Link href="/community/announcements">Announcements</Link><ChevronRight size={14} aria-hidden /><span className={styles.crumbCurrent} aria-current="page">{a.title}</span>
      </nav>
      <article className={styles.card}>
        <h1 className={styles.title}>{a.title}</h1>
        <div className={community.annMeta} style={{ marginTop: 8 }}><OfficialBadge /> {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}</div>
        {/* Sanitized when saved and again before it is sent. */}
        {a.bodyHtml ? <div className={styles.content} dangerouslySetInnerHTML={{ __html: a.bodyHtml }} /> : <p className={`${styles.content} ${styles.plain}`}>{a.body}</p>}
      </article>
    </CommunityShell>
  );
}
