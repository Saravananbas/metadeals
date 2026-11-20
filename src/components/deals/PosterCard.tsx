import Link from "next/link";
import { MessageCircle, Star, ThumbsUp, Tag, User } from "lucide-react";
import { BadgeStrip } from "@/features/badges/BadgeStrip";
import type { TopBadge } from "@/features/badges/catalog";
import { PosterActions } from "./PosterActions";
import styles from "./DealExtras.module.css";

export type Poster = {
  handle: string;
  hasAvatar: boolean;
  online: boolean;
  memberSince: string;
  stats: { reputation: number; votes: number; deals: number; comments: number };
  badges: { top: TopBadge[]; total: number };
  viewer: { isOwner: boolean; signedIn: boolean; following: boolean; starred: boolean };
  messaging: boolean;
};

const n = (value: number) => value.toLocaleString("en-IN");

/** About the Poster: user name and join month with Follow, Give Star, Message and View profile on top; Reputation Points, Votes Submitted, Deals Posted and Comments Posted below. Never a real name or email. */
export function PosterCard({ poster }: { poster: Poster | null }) {
  if (!poster) return <p className={styles.muted}>This deal was posted by the MetaDeals4U team.</p>;
  const stats = [
    { icon: Star, label: "Reputation Points", value: poster.stats.reputation, tone: styles.toneStar },
    { icon: ThumbsUp, label: "Votes Submitted", value: poster.stats.votes, tone: styles.toneVote },
    { icon: Tag, label: "Deals Posted", value: poster.stats.deals, tone: styles.toneDeal },
    { icon: MessageCircle, label: "Comments Posted", value: poster.stats.comments, tone: styles.toneComment },
  ];
  return (
    <>
      <div className={styles.poster}>
        <span className={styles.avatarBox}>
          {poster.hasAvatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={styles.avatar} src={`/api/v1/avatars/${poster.handle}`} alt="" width={56} height={56} />
            : <span className={styles.avatarFallback} aria-hidden="true">{poster.handle.slice(0, 1).toUpperCase() || <User size={24} />}</span>}
          {poster.online && <span className={styles.onlineDot} role="img" aria-label="Online now" title="Online now" />}
        </span>
        <div className={styles.posterInfo}>
          <strong>@{poster.handle}</strong>
          <span>Joined in {poster.memberSince}</span>
        </div>
        <div className={styles.posterButtons}>
          <PosterActions handle={poster.handle} viewer={poster.viewer} messaging={poster.messaging} />
          <Link className={styles.chip} href={`/community/u/${poster.handle}`}>View profile</Link>
        </div>
      </div>
      <dl className={styles.statGrid}>
        {stats.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className={styles.stat}>
            <span className={`${styles.statIcon} ${tone}`} aria-hidden="true"><Icon size={18} /></span>
            <div><dd>{n(value)}</dd><dt>{label}</dt></div>
          </div>
        ))}
      </dl>
      <BadgeStrip top={poster.badges.top} total={poster.badges.total} />
    </>
  );
}
