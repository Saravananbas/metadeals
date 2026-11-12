import Link from "next/link";
import { CustomerError } from "@/server/customer/service";
import { getCommunity, listCommunities, listFeed } from "@/server/community/service";
import { CommunityShell } from "./Shell";
import { FollowButton } from "./PostActions";
import { Empty, PostCard } from "./parts";
import styles from "../community.module.css";

export type FeedParams = { sort?: string; type?: string; cursor?: string; window?: string };

export async function FeedPage({ params, customerId, communitySlug }: { params: FeedParams; customerId: string | null; communitySlug?: string }) {
  const communities = await listCommunities(customerId);
  let current: Awaited<ReturnType<typeof getCommunity>> | null = null;
  if (communitySlug) {
    try { current = await getCommunity(communitySlug, customerId); } catch (error) { if (error instanceof CustomerError && error.status === 404) return null; throw error; }
  }
  const query = { sort: params.sort === "top" ? "top" : "new", type: params.type, window: params.window, cursor: params.cursor, community: communitySlug };
  const feed = await listFeed(query, customerId).catch(() => ({ items: [], nextCursor: null as string | null }));
  const base = communitySlug ? `/community/c/${communitySlug}` : "/community";
  const href = (extra: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: query.sort === "top" ? "top" : undefined, type: params.type, ...extra })) if (v) search.set(k, v);
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <CommunityShell active="feed">
      <div className={styles.layout}>
        <div style={{ display: "grid", gap: 12 }}>
          {current && (
            <div className={styles.card}>
              <h1 style={{ margin: 0 }}>{current.name}</h1>
              <p className={styles.notice}>{current.description}</p>
              <div className={styles.actions}><FollowButton slug={current.slug} following={current.following} /><Link className={`${styles.btn} ${styles.btnPrimary}`} href={`/community/submit?community=${current.slug}`}>New post</Link></div>
            </div>
          )}
          <div className={styles.filters} aria-label="Sort and filter">
            <Link className={`${styles.chip} ${query.sort === "new" ? styles.chipActive : ""}`} href={href({ sort: undefined })}>New</Link>
            <Link className={`${styles.chip} ${query.sort === "top" ? styles.chipActive : ""}`} href={href({ sort: "top" })}>Top this week</Link>
            {(["DEAL", "DISCUSSION", "QUESTION"] as const).map((t) => (
              <Link key={t} className={`${styles.chip} ${params.type === t ? styles.chipActive : ""}`} href={href({ type: params.type === t ? undefined : t })}>{t === "DEAL" ? "Deals" : t === "DISCUSSION" ? "Discussions" : "Questions"}</Link>
            ))}
          </div>
          {feed.items.map((post) => <PostCard key={post.id} post={post} />)}
          {!feed.items.length && <Empty>{params.cursor ? "No more posts." : "No posts yet. Be the first to start a conversation."}</Empty>}
          {feed.nextCursor && <Link className={styles.btn} style={{ justifySelf: "center" }} href={href({ cursor: feed.nextCursor })}>Older posts →</Link>}
        </div>
        <aside className={styles.side} aria-label="Communities">
          <div className={styles.card}>
            <h2>Communities</h2>
            <div style={{ display: "grid", gap: 6 }}>
              {communities.map((c) => <Link key={c.slug} href={`/community/c/${c.slug}`} className={`${styles.chip} ${c.slug === communitySlug ? styles.chipActive : ""}`}>{c.name} <span className={styles.notice}>({c.postCount})</span></Link>)}
              {!communities.length && <span className={styles.notice}>No communities yet.</span>}
            </div>
          </div>
          <div className={styles.card}>
            <h2>Good to know</h2>
            <p className={styles.notice}>Posts here are written by members. Deals shared here are <strong>not</strong> official MetaDeals4U deals; check the store before you buy. Please be kind and report anything that breaks the rules.</p>
          </div>
        </aside>
      </div>
    </CommunityShell>
  );
}
