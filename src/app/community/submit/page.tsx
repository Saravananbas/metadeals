import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { CommunityShell } from "@/features/community/components/Shell";
import { Composer } from "@/features/community/components/Composer";
import { communityPageViewer } from "@/server/community/session";
import { ensureProfile, listCommunities } from "@/server/community/service";
import { getDatabase } from "@/server/db/client";
import styles from "@/features/community/composer.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New discussion | MetaDeals4U Community", robots: { index: false, follow: false } };

// The five general areas members can post in (Announcements is for the team).
const GENERAL = ["deals-discussions", "help-support", "feedback-ideas", "off-topic"];

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ community?: string }> }) {
  const customerId = await communityPageViewer();
  const communities = await listCommunities(customerId);
  const categories = await getDatabase().category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, parentId: true, id: true } });
  const slugOf = (c: { slug: string }) => c.slug.slice(0, 40).replace(/-+$/, "");
  const known = new Set(communities.map((c) => c.slug));
  const tree = categories.filter((c) => known.has(slugOf(c))).map((c) => ({ id: c.id, parentId: c.parentId, slug: slugOf(c), name: c.name }));
  const profile = customerId ? await ensureProfile(customerId).catch(() => null) : null;
  const viewer = profile ? { handle: profile.handle, avatarUrl: profile.avatarKey ? `/api/v1/avatars/${profile.handle}` : null } : null;
  const general = communities.filter((c) => GENERAL.includes(c.slug)).map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <CommunityShell active="submit">
      <div className={styles.head}>
        <div>
          <Link href="/community" className={styles.back}><ArrowLeft size={18} /> Back to Community</Link>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon}><PenLine size={26} /></span>
            <div><h1>Create a New Discussion</h1><p>Share your thoughts, ask a question, or share a deal with the MetaDeals4U community.</p></div>
          </div>
        </div>
        <div className={styles.art} aria-hidden><span>💬</span><span>👥</span><span>🛍️</span></div>
      </div>
      {!viewer && <p className={styles.dealNote}>You are not signed in. You can look around, but you need to <Link href="/account">sign in</Link> to post, save drafts or add pictures.</p>}
      {communities.length
        ? <Composer communities={communities.map((c) => ({ slug: c.slug, name: c.name }))} tree={tree} general={general} defaultCommunity={(await searchParams).community} viewer={viewer} />
        : <p>There are no communities yet.</p>}
    </CommunityShell>
  );
}
