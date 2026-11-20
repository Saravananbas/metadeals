import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bookmark, CalendarDays, Heart, MapPin, MessageCircle, MessagesSquare, Tag } from "lucide-react";
import { CommunityShell } from "@/features/community/components/Shell";
import { PostCard, ago, rupees } from "@/features/community/components/parts";
import { CopyProfileLink, ProfileActions } from "@/features/profile/ProfileActions";
import { VerifiedBadge } from "@/features/profile/VerifiedBadge";
import { BadgeStrip } from "@/features/badges/BadgeStrip";
import { CustomerError } from "@/server/customer/service";
import { getMemberProfile, PROFILE_TABS, type ProfileTab } from "@/server/community/profile";
import { communityPageViewer } from "@/server/community/session";
import { messagesEnabled } from "@/server/messages/service";
import styles from "@/features/profile/profile.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member | MetaDeals4U Community", robots: { index: false, follow: false } };

const month = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const Empty = ({ children }: { children: string }) => <p className={styles.empty}>{children}</p>;
const TAB_LABEL: Record<ProfileTab, string> = { overview: "Overview", deals: "Deals", discussions: "Discussions", comments: "Comments", saved: "Saved", about: "About" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string; public?: string }> }) {
  const viewer = await communityPageViewer();
  const { handle } = await params;
  const asked = (await searchParams).tab as ProfileTab | undefined;
  const tab = asked && PROFILE_TABS.includes(asked) ? asked : "overview";
  const p = await getMemberProfile(decodeURIComponent(handle), viewer, tab).catch((error) => { if (error instanceof CustomerError && error.status === 404) return null; throw error; });
  if (!p) notFound();
  // Members manage their own profile on the combined account page; ?public=1 shows them the page other members see.
  if (p.isOwner && (await searchParams).public !== "1") redirect("/account");
  const base = `/community/u/${p.handle}`;
  const tabs = PROFILE_TABS.filter((t) => t !== "saved" || p.isOwner);

  const dealList = (p.deals ?? []).length ? (
    <ul className={styles.list}>
      {p.deals!.map((d) => (
        <li key={d.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.imageUrl ? <img className={styles.thumb} src={d.imageUrl} alt="" loading="lazy" /> : <Tag size={20} aria-hidden />}
          <div className={styles.grow}>
            {d.url ? <Link href={d.url}>{d.title}</Link> : <strong>{d.title}</strong>}
            <p>{rupees(d.priceMinor)}{d.mrpMinor ? <> <s>{rupees(d.mrpMinor)}</s></> : null}{d.merchantName ? ` at ${d.merchantName}` : ""}</p>
          </div>
          {p.isOwner && <span className={`${styles.chip} ${styles[`chip${d.stage}`] ?? ""}`}>{d.stageLabel}</span>}
        </li>
      ))}
    </ul>
  ) : <Empty>{p.isOwner ? "You have not shared a deal yet." : "No live deals from this member yet."}</Empty>;

  const commentList = (p.comments ?? []).length ? (
    <ul className={styles.list}>
      {p.comments!.map((c) => (
        <li key={c.id}>
          <MessageCircle size={18} aria-hidden />
          <div className={styles.grow}><Link href={`/community/post/${c.post.slug}#c-${c.id}`}>{c.isReply ? "Replied in: " : "Commented on: "}{c.post.title}</Link><p>{c.excerpt}</p></div>
          <span className={styles.when}>{ago(c.createdAt)}</span>
        </li>
      ))}
    </ul>
  ) : <Empty>No public comments yet.</Empty>;

  const about = (
    <section className={`${styles.card} ${styles.panel}`}>
      <h2>About</h2>
      {p.bio ? <p className={styles.bio}>{p.bio}</p> : <p className={styles.since}>{p.isOwner ? "Add a short bio from Edit Profile." : "This member has not written a bio yet."}</p>}
      {p.location && <div className={styles.aboutRow}><MapPin size={18} aria-hidden /><div><small>City / State</small>{p.location}</div></div>}
      <div className={styles.aboutRow}><CalendarDays size={18} aria-hidden /><div><small>Member since</small>{month(p.memberSince)}</div></div>
    </section>
  );

  return (
    <CommunityShell>
      <div className={styles.wrap}>
        <section className={`${styles.card} ${styles.head}`}>
          <div className={styles.banner} aria-hidden />
          <div className={styles.headBody}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.avatarUrl ? <img className={styles.avatar} src={p.avatarUrl} alt="" /> : <span className={styles.avatar} aria-hidden>{p.handle.slice(0, 1).toUpperCase()}</span>}
            <div className={styles.names}>
              <h1 className={styles.handle}>{p.handle}{p.verified && <VerifiedBadge size={22} />}</h1>
              {p.displayName && <span className={styles.display}>{p.displayName}</span>}
              <span className={styles.since}>Member since {month(p.memberSince)}</span>
            </div>
            <ProfileActions handle={p.handle} isOwner={p.isOwner} signedIn={Boolean(viewer)} messaging={messagesEnabled()} following={p.viewer?.following ?? false} />
            {p.bio && <p className={styles.bio}>{p.bio}</p>}
            <BadgeStrip top={p.badges.top} total={p.badges.total} />
            <div className={styles.facts}>
              {p.location && <span><MapPin size={15} aria-hidden /> {p.location}</span>}
              <span>{p.followers} {p.followers === 1 ? "follower" : "followers"} · {p.following} following</span>
              <CopyProfileLink path={p.profileUrl} />
            </div>
          </div>
        </section>

        <section className={styles.stats} aria-label="Member statistics">
          <div className={`${styles.card} ${styles.stat}`}><Tag size={26} aria-hidden /><div><strong>{p.stats.dealsShared}</strong><span>Deals Shared</span></div></div>
          <div className={`${styles.card} ${styles.stat}`}><MessagesSquare size={26} aria-hidden /><div><strong>{p.stats.discussions}</strong><span>Discussions</span></div></div>
          <div className={`${styles.card} ${styles.stat}`}><MessageCircle size={26} aria-hidden /><div><strong>{p.stats.comments}</strong><span>Comments</span></div></div>
          <div className={`${styles.card} ${styles.stat}`}><Heart size={26} aria-hidden /><div><strong>{p.stats.likesReceived}</strong><span>Likes Received</span></div></div>
          {p.isOwner && <div className={`${styles.card} ${styles.stat}`}><Tag size={26} aria-hidden /><div><strong>{p.stats.publishedDeals}</strong><span>Published Deals</span></div></div>}
          {p.isOwner && <div className={`${styles.card} ${styles.stat}`}><Bookmark size={26} aria-hidden /><div><strong>{p.stats.saved}</strong><span>Saved Items (only you see this)</span></div></div>}
        </section>

        <nav className={`${styles.card} ${styles.tabs}`} aria-label="Profile sections">
          {tabs.map((t) => <Link key={t} href={t === "overview" ? base : `${base}?tab=${t}`} className={`${styles.tab} ${t === tab ? styles.tabOn : ""}`} aria-current={t === tab ? "page" : undefined} scroll={false}>{t === "deals" && p.isOwner ? "My Deals" : TAB_LABEL[t]}</Link>)}
        </nav>

        {tab === "overview" && (
          <div className={styles.cols}>
            <section className={`${styles.card} ${styles.panel}`}>
              <h2>Recent Activity</h2>
              {(p.activity ?? []).length ? (
                <ul className={styles.list}>
                  {p.activity!.map((a) => (
                    <li key={a.url}>
                      {a.kind === "deal" ? <Tag size={18} aria-hidden /> : a.kind === "comment" ? <MessageCircle size={18} aria-hidden /> : <MessagesSquare size={18} aria-hidden />}
                      <div className={styles.grow}>{a.kind === "deal" ? "Shared a deal: " : a.kind === "comment" ? "Commented on: " : "Started a discussion: "}<Link href={a.url}>{a.title}</Link></div>
                      <span className={styles.when}>{ago(a.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No public activity yet.</Empty>}
            </section>
            {about}
          </div>
        )}
        {tab === "deals" && <section className={`${styles.card} ${styles.panel}`}><h2>{p.isOwner ? "My Deals" : "Deals"}</h2>{dealList}{p.isOwner && <Link href="/post-deal" className={styles.btn}>Post a deal</Link>}</section>}
        {tab === "discussions" && ((p.discussions ?? []).length ? p.discussions!.map((post) => <PostCard key={post.id} post={post} />) : <section className={`${styles.card} ${styles.panel}`}><Empty>No public discussions yet.</Empty></section>)}
        {tab === "comments" && <section className={`${styles.card} ${styles.panel}`}><h2>Comments</h2>{commentList}</section>}
        {tab === "saved" && ((p.saved ?? []).length ? p.saved!.map((post) => <PostCard key={post.id} post={post} />) : <section className={`${styles.card} ${styles.panel}`}><Empty>You have not saved any discussions yet. Saved deals are kept on your device and open from the heart icon on the deals page.</Empty></section>)}
        {tab === "about" && about}
      </div>
    </CommunityShell>
  );
}
