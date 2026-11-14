import Link from "next/link";
import { CustomerError } from "@/server/customer/service";
import { listPublicAnnouncements } from "@/server/community/announcements";
import { OfficialBadge } from "./OfficialBadge";
import { communityOverview, CURATED_COMMUNITIES, FEED_FILTERS, FEED_SORTS, FEED_VIEWS, getCommunity, listCommunities, listDiscussions, type PostDto } from "@/server/community/service";
import { CommunityShell } from "./Shell";
import { FollowButton } from "./PostActions";
import { Empty, PostCard, ago } from "./parts";
import styles from "../community.module.css";

export type FeedParams = { filter?: string; sort?: string; type?: string; view?: string; q?: string; page?: string; window?: string };

const FILTER_LABEL: Record<(typeof FEED_FILTERS)[number], string> = { latest: "Latest", trending: "Trending", liked: "Most Liked", commented: "Most Commented", unanswered: "Unanswered" };
const SORT_LABEL: Record<(typeof FEED_SORTS)[number], string> = { recent: "Most Recent", oldest: "Oldest", viewed: "Most Viewed" };
const TYPE_CHIPS = [["DEAL", "Deals"], ["DISCUSSION", "Discussions"], ["QUESTION", "Questions"]] as const;
const pick = <T extends string>(list: readonly T[], value: string | undefined) => list.find((v) => v === value);

export async function FeedPage({ params, customerId, communitySlug }: { params: FeedParams; customerId: string | null; communitySlug?: string }) {
  const communities = await listCommunities(customerId);
  let current: Awaited<ReturnType<typeof getCommunity>> | null = null;
  if (communitySlug) {
    try { current = await getCommunity(communitySlug, customerId); } catch (error) { if (error instanceof CustomerError && error.status === 404) return null; throw error; }
  }
  // The earlier "New" and "Top this week" buttons now map to Latest and Trending; old links (?sort=top) keep working.
  const filter = pick(FEED_FILTERS, params.filter) ?? (params.sort === "top" ? "trending" : "latest");
  const sort = pick(FEED_SORTS, params.sort);
  const view = pick(FEED_VIEWS, params.view) ?? "all";
  const type = pick(["DEAL", "DISCUSSION", "QUESTION"] as const, params.type);
  const q = (params.q ?? "").slice(0, 80);
  const page = Math.max(1, Math.min(200, Number(params.page) || 1));

  const [feed, overview] = await Promise.all([
    listDiscussions({ filter, sort, view, type, q, page, community: communitySlug }, customerId).catch(() => null),
    communityOverview(customerId).catch(() => null),
  ]);
  const failed = feed === null;
  const base = communitySlug ? `/community/c/${communitySlug}` : "/community";
  const href = (extra: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const merged: Record<string, string | undefined> = { filter: filter === "latest" ? undefined : filter, sort, view: view === "all" ? undefined : view, type, q: q || undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) search.set(k, v);
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const curated = CURATED_COMMUNITIES.map((c) => communities.find((x) => x.slug === c.slug)).filter((c): c is (typeof communities)[number] => Boolean(c));
  const curatedSlugs = new Set<string>(CURATED_COMMUNITIES.map((c) => c.slug));
  const shop = communities.filter((c) => !curatedSlugs.has(c.slug));
  const shopBusy = shop.filter((c) => c.postCount > 0 || c.following || c.slug === communitySlug).sort((a, b) => b.postCount - a.postCount);
  const shopRest = shop.filter((c) => !shopBusy.includes(c));
  const total = communities.reduce((n, c) => n + c.postCount, 0);
  const announcements = await listPublicAnnouncements(3).catch(() => ({ items: [], total: 0 }));

  const sideLink = (label: string, to: string, active: boolean, count?: number) => (
    <Link key={to} href={to} className={`${styles.sideLink} ${active ? styles.sideLinkActive : ""}`} aria-current={active ? "page" : undefined}><span>{label}</span>{count !== undefined && <em>{count}</em>}</Link>
  );
  const onAll = !communitySlug && view === "all";
  const heading = view === "mine" ? "My discussions" : view === "saved" ? "Saved posts" : view === "following" ? "Following topics" : q ? `Results for “${q}”` : current ? current.name : null;

  const left = (
    <aside className={styles.left} aria-label="Discussion categories">
      <Link className={styles.startBtn} href={`/community/submit${communitySlug ? `?community=${communitySlug}` : ""}`}>＋ Start New Discussion</Link>
      <nav className={styles.sideGroup} aria-label="Discussion categories">
        {sideLink("All Discussions", "/community", onAll, total)}
        {curated.map((c) => c.slug === "announcements"
          ? sideLink(c.name, "/community/announcements", false, announcements.total)
          : sideLink(c.name, `/community/c/${c.slug}`, c.slug === communitySlug, c.postCount))}
      </nav>
      <nav className={styles.sideGroup} aria-label="My activity">
        <h2>My Activity</h2>
        {sideLink("My Discussions", "/community?view=mine", view === "mine", overview?.mine?.discussions)}
        {sideLink("My Comments", "/community/me#comments", false, overview?.mine?.comments)}
        {sideLink("Saved Posts", "/community?view=saved", view === "saved", overview?.mine?.saved)}
        {sideLink("Following Topics", "/community?view=following", view === "following", overview?.mine?.following)}
      </nav>
    </aside>
  );

  return (
    <CommunityShell active="feed" q={q}>
      <div className={styles.grid3}>
        <details className={styles.mobileNav}>
          <summary>Categories and my activity</summary>
          {left}
        </details>
        <div className={styles.leftDesktop}>{left}</div>

        <section className={styles.center} aria-label="Discussions">
          <div className={styles.hero}>
            <div>
              <h1>MetaDeals4U Community</h1>
              <p>Discuss deals, share insights, get help and connect with smart shoppers.</p>
            </div>
            <div className={styles.heroArt} aria-hidden><span>💬</span><span>🛍️</span><span>⭐</span></div>
          </div>

          {current && (
            <div className={styles.card}>
              <h2 style={{ margin: 0 }}>{current.name}</h2>
              <p className={styles.notice}>{current.description}</p>
              <div className={styles.actions}><FollowButton slug={current.slug} following={current.following} /><Link className={`${styles.btn} ${styles.btnPrimary}`} href={`/community/submit?community=${current.slug}`}>New post</Link></div>
            </div>
          )}

          <form className={styles.searchRow} action={base} role="search">
            {filter !== "latest" && <input type="hidden" name="filter" value={filter} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            {view !== "all" && <input type="hidden" name="view" value={view} />}
            {type && <input type="hidden" name="type" value={type} />}
            <input name="q" defaultValue={q} maxLength={80} placeholder="Search discussions, topics, members" aria-label="Search discussions" />
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Search</button>
            {q && <Link className={styles.btn} href={href({ q: undefined, page: undefined })}>Clear</Link>}
          </form>

          <div className={styles.tabs} role="tablist" aria-label="Filter discussions">
            {FEED_FILTERS.map((f) => <Link key={f} role="tab" aria-selected={filter === f} className={`${styles.tab} ${filter === f ? styles.tabActive : ""}`} href={href({ filter: f === "latest" ? undefined : f, page: undefined })}>{FILTER_LABEL[f]}</Link>)}
          </div>
          <div className={styles.subRow}>
            <div className={styles.filters} aria-label="Type">
              <Link className={`${styles.chip} ${!type ? styles.chipActive : ""}`} href={href({ type: undefined, page: undefined })}>All</Link>
              {TYPE_CHIPS.map(([t, label]) => <Link key={t} className={`${styles.chip} ${type === t ? styles.chipActive : ""}`} href={href({ type: type === t ? undefined : t, page: undefined })}>{label}</Link>)}
            </div>
            <details className={styles.sortMenu}>
              <summary>Sort by: <strong>{sort ? SORT_LABEL[sort] : "Default"}</strong></summary>
              <div className={styles.menuPanel}>
                <Link href={href({ sort: undefined, page: undefined })}>Default for this tab</Link>
                {FEED_SORTS.map((s) => <Link key={s} href={href({ sort: s, page: undefined })}>{SORT_LABEL[s]}</Link>)}
              </div>
            </details>
          </div>

          {heading && <h2 className={styles.resultsHead}>{heading}{feed && (q || view !== "all") ? <span> · {feed.total} {feed.total === 1 ? "result" : "results"}</span> : null}</h2>}

          {failed ? <Empty>We could not load discussions just now. Please refresh in a moment.</Empty>
            : feed.requiresSignIn ? <Empty><strong>Sign in to see this list.</strong><br /><Link className={`${styles.btn} ${styles.btnPrimary}`} href="/account">Sign in</Link></Empty>
            : feed.items.length ? feed.items.map((post: PostDto) => <PostCard key={post.id} post={post} />)
            : <EmptyState q={q} filter={filter} view={view} communitySlug={communitySlug} />}

          {feed && feed.pageCount > 1 && <Pagination page={feed.page} pageCount={feed.pageCount} total={feed.total} limit={feed.limit} href={(n) => href({ page: n > 1 ? String(n) : undefined })} />}
        </section>

        <aside className={styles.right} aria-label="Community information">
          <div className={styles.card}>
            <h2>Community Statistics</h2>
            {overview ? (
              <div className={styles.statRow}>
                <div><strong>{overview.stats.members.toLocaleString("en-IN")}</strong><small>Members</small></div>
                <div><strong>{overview.stats.discussions.toLocaleString("en-IN")}</strong><small>Discussions</small></div>
                <div><strong>{overview.stats.comments.toLocaleString("en-IN")}</strong><small>Comments</small></div>
              </div>
            ) : <p className={styles.notice}>Statistics are unavailable right now.</p>}
          </div>
          <div className={styles.card}>
            <h2>Trending Topics</h2>
            {overview?.trendingTopics.length ? overview.trendingTopics.map((t) => <Link key={t.slug} className={styles.topicRow} href={`/community/c/${t.slug}`}><span># {t.name}</span><em>{t.posts} {t.posts === 1 ? "post" : "posts"}</em></Link>) : <p className={styles.notice}>No new posts in the last two weeks. Topics appear here as people post.</p>}
          </div>
          <div className={styles.card}>
            <h2>Communities</h2>
            <div className={styles.commList}>
              {shopBusy.map((c) => <Link key={c.slug} href={`/community/c/${c.slug}`} className={`${styles.chip} ${c.slug === communitySlug ? styles.chipActive : ""}`}>{c.name} <span className={styles.notice}>({c.postCount})</span></Link>)}
              {!communities.length && <span className={styles.notice}>No communities yet.</span>}
              {shopRest.length > 0 && <details><summary className={styles.notice} style={{ cursor: "pointer" }}>{shopBusy.length ? "More communities" : "Browse communities"} ({shopRest.length})</summary><div className={styles.commList} style={{ marginTop: 6 }}>{shopRest.map((c) => <Link key={c.slug} href={`/community/c/${c.slug}`} className={styles.chip}>{c.name} <span className={styles.notice}>({c.postCount})</span></Link>)}</div></details>}
            </div>
          </div>
          <div className={styles.card}>
            <h2>Official announcements</h2>
            {announcements.items.length ? announcements.items.map((x) => (
              <Link key={x.slug} className={styles.annRow} href={`/community/announcements/${x.slug}`}>
                <span className={styles.annTitle}>{x.title}</span>
                <span className={styles.annText}>{x.body.length > 90 ? x.body.slice(0, 90) + "…" : x.body}</span>
                <span className={styles.annMeta}><OfficialBadge /> {x.publishedAt ? new Date(x.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
              </Link>
            )) : <p className={styles.notice}>No announcements yet.</p>}
            {announcements.total > announcements.items.length && <Link className={styles.topicRow} href="/community/announcements"><span>See all announcements</span><em>{announcements.total}</em></Link>}
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


function EmptyState({ q, filter, view, communitySlug }: { q: string; filter: string; view: string; communitySlug?: string }) {
  const searching = Boolean(q), mine = view !== "all";
  return (
    <div className={`${styles.card} ${styles.emptyState}`}>
      <div className={styles.emptyArt} aria-hidden>💬</div>
      <h2>{searching ? "No discussions match your search" : mine ? "Nothing here yet" : filter === "unanswered" ? "Every discussion has an answer" : "No discussions yet"}</h2>
      <p className={styles.notice}>{searching ? "Try fewer or different words, or clear the search." : mine ? "Save a post, follow a topic or start a discussion and it will show up here." : "Be the first to start a conversation about a deal, a product or a question."}</p>
      <Link className={`${styles.btn} ${styles.btnPrimary}`} href={`/community/submit${communitySlug ? `?community=${communitySlug}` : ""}`}>Start a discussion</Link>
    </div>
  );
}

function Pagination({ page, pageCount, total, limit, href }: { page: number; pageCount: number; total: number; limit: number; href: (n: number) => string }) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const list = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const from = (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return (
    <nav className={styles.pager} aria-label="Pages">
      <span className={styles.notice}>Showing {from}–{to} of {total.toLocaleString("en-IN")} discussions</span>
      <div className={styles.pagerLinks}>
        {page > 1 && <Link href={href(page - 1)} aria-label="Previous page">‹</Link>}
        {list.map((n, i) => <span key={n} style={{ display: "contents" }}>{i > 0 && n - list[i - 1] > 1 && <span className={styles.notice}>…</span>}<Link href={href(n)} aria-current={n === page ? "page" : undefined} className={n === page ? styles.pageOn : undefined}>{n}</Link></span>)}
        {page < pageCount && <Link href={href(page + 1)} aria-label="Next page">›</Link>}
      </div>
    </nav>
  );
}
