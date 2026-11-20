/**
 * Member badges: the categories, their five tiers and how far a member is. Plain data and pure functions, so the website, the apps and the tests all read
 * the same rules. Counts are produced on the server from rows the site already stores (see src/server/badges/counts.ts); this file only turns counts into progress.
 * Change a name or a number here and nothing else needs to change.
 */
export type BadgeIcon =
  | "tag" | "flame" | "mouse" | "bookmark" | "share" | "message" | "mic" | "heart" | "book" | "quote" | "magnet" | "sparkles" | "users" | "shield" | "calendar";
export type BadgeGroup = "deals" | "community" | "safety" | "membership";

export type BadgeCategory = {
  key: string;
  group: BadgeGroup;
  title: string;
  icon: BadgeIcon;
  /** What is counted, in plain words ("deals of yours that were approved"). */
  counts: string;
  /** The same sentence for the "Need N more ..." line. */
  unit: string;
  tiers: readonly { name: string; need: number }[];
};

export const GROUP_TITLES: Record<BadgeGroup, string> = {
  deals: "Deals and discovery",
  community: "Community achievements",
  safety: "Trust and safety",
  membership: "Membership milestones",
};

export const BADGE_CATEGORIES: readonly BadgeCategory[] = [
  { key: "deal-hunter", group: "deals", title: "Deal Hunter", icon: "tag", counts: "deals of yours that were approved", unit: "approved deals",
    tiers: [{ name: "Rookie Scout", need: 1 }, { name: "Price Tracker", need: 5 }, { name: "Deal Sniper", need: 15 }, { name: "Bargain Boss", need: 50 }, { name: "Deal Legend", need: 100 }] },
  { key: "deal-impact", group: "deals", title: "Deal Impact", icon: "flame", counts: "views on your deals", unit: "views",
    tiers: [{ name: "Spark", need: 100 }, { name: "Blaze", need: 500 }, { name: "Rocket", need: 2000 }, { name: "Comet", need: 10000 }, { name: "Supernova", need: 50000 }] },
  { key: "click-champion", group: "deals", title: "Click Champion", icon: "mouse", counts: "Buy Now clicks on your deals", unit: "clicks",
    tiers: [{ name: "Tap Starter", need: 10 }, { name: "Click Magnet", need: 50 }, { name: "Traffic Booster", need: 250 }, { name: "Rainmaker", need: 1000 }, { name: "Powerhouse", need: 5000 }] },
  { key: "deal-collectors", group: "deals", title: "Deal Collectors", icon: "bookmark", counts: "times members saved your deals", unit: "saves",
    tiers: [{ name: "Wishlist Spark", need: 5 }, { name: "Cart Favourite", need: 25 }, { name: "Crowd Pleaser", need: 100 }, { name: "Treasure Chest", need: 500 }, { name: "Vault Master", need: 2000 }] },
  { key: "sharing-legends", group: "deals", title: "Sharing Legends", icon: "share", counts: "times your deals were shared", unit: "shares",
    tiers: [{ name: "Pass It On", need: 5 }, { name: "Word Spreader", need: 25 }, { name: "Buzz Maker", need: 100 }, { name: "Trend Starter", need: 500 }, { name: "Viral Legend", need: 2000 }] },

  { key: "community-voice", group: "community", title: "Community Voice", icon: "message", counts: "comments you wrote", unit: "comments",
    tiers: [{ name: "Chatterbox", need: 5 }, { name: "Banter Buddy", need: 25 }, { name: "Thread Weaver", need: 100 }, { name: "Silver Tongue", need: 500 }, { name: "Voice of the Crowd", need: 2000 }] },
  { key: "conversation-starters", group: "community", title: "Conversation Starters", icon: "mic", counts: "discussions you started", unit: "discussions",
    tiers: [{ name: "Icebreaker", need: 1 }, { name: "Spark Starter", need: 5 }, { name: "Thread Igniter", need: 20 }, { name: "Topic Boss", need: 75 }, { name: "Community Architect", need: 200 }] },
  { key: "comment-appreciation", group: "community", title: "Comment Appreciation", icon: "heart", counts: "likes your comments received", unit: "likes on comments",
    tiers: [{ name: "Nice One", need: 10 }, { name: "Crowd Favourite", need: 50 }, { name: "Applause Magnet", need: 250 }, { name: "Heart Collector", need: 1000 }, { name: "Legend of Likes", need: 2500 }] },
  { key: "discussion-appreciation", group: "community", title: "Discussion Appreciation", icon: "book", counts: "likes your discussions received", unit: "likes on discussions",
    tiers: [{ name: "Worth a Read", need: 10 }, { name: "Hot Topic", need: 50 }, { name: "Trending Topic", need: 250 }, { name: "Topic Titan", need: 1000 }, { name: "Iconic Thread", need: 2500 }] },
  { key: "comment-legends", group: "community", title: "Comment Legends", icon: "quote", counts: "comments that earned 10 or more likes", unit: "10-like comments",
    tiers: [{ name: "Quotable", need: 1 }, { name: "Mic Drop", need: 3 }, { name: "Showstopper", need: 10 }, { name: "Comment Royalty", need: 25 }, { name: "Masterpiece", need: 50 }] },
  { key: "community-magnets", group: "community", title: "Community Magnets", icon: "magnet", counts: "discussions that drew 20 or more comments", unit: "busy discussions",
    tiers: [{ name: "Spark Plug", need: 1 }, { name: "Crowd Puller", need: 3 }, { name: "Thread Magnet", need: 10 }, { name: "Buzz Hub", need: 25 }, { name: "Landmark Thread", need: 50 }] },
  { key: "positive-influence", group: "community", title: "Positive Influence", icon: "sparkles", counts: "likes and upvotes you gave to other members", unit: "likes and upvotes given",
    tiers: [{ name: "Cheerleader", need: 25 }, { name: "Hype Squad", need: 100 }, { name: "Good Vibes", need: 500 }, { name: "Morale Booster", need: 2500 }, { name: "Inspiration", need: 5000 }] },
  { key: "growing-followers", group: "community", title: "Growing Followers", icon: "users", counts: "members who follow you", unit: "followers",
    tiers: [{ name: "Noticed", need: 5 }, { name: "Rising Star", need: 25 }, { name: "Fan Club", need: 100 }, { name: "Local Celebrity", need: 500 }, { name: "Community Icon", need: 2000 }] },

  { key: "community-guardians", group: "safety", title: "Community Guardians", icon: "shield", counts: "your reports that moderators acted on", unit: "upheld reports",
    tiers: [{ name: "Eagle Eye", need: 1 }, { name: "Rule Keeper", need: 3 }, { name: "Shield Bearer", need: 10 }, { name: "Protector", need: 25 }, { name: "Guardian Angel", need: 50 }] },

  { key: "loyalty-journey", group: "membership", title: "Loyalty Journey", icon: "calendar", counts: "days as a member", unit: "days",
    tiers: [{ name: "Fresh Face", need: 30 }, { name: "Regular Shopper", need: 90 }, { name: "Deal Veteran", need: 180 }, { name: "Seasoned Pro", need: 365 }, { name: "Legend of the Deals", need: 730 }] },
];

export type BadgeCounts = Record<string, number>;
export type BoardTier = { name: string; need: number; earned: boolean };
export type BoardCategory = {
  key: string; group: BadgeGroup; title: string; icon: BadgeIcon; counts: string;
  value: number;
  /** Tiers reached, 0 to 5. */
  level: number;
  tiers: BoardTier[];
  /** The tier being worked on, or null when all five are earned. */
  next: { name: string; need: number; remaining: number; progress: number } | null;
  /** Progress inside the current step, 0 to 1 (used for the bar). */
  progress: number;
};
export type BadgeBoard = { earned: number; total: number; categories: BoardCategory[] };

export type TopBadge = { key: string; title: string; icon: BadgeIcon; name: string; level: number };

/** The best badges to show on a public profile: the highest tier reached in each category, strongest first (ties keep the catalogue order). Names only: counts stay private. */
export function topBadges(board: BadgeBoard, limit = 3): { top: TopBadge[]; total: number } {
  const reached = board.categories.filter((c) => c.level > 0).map((c) => ({ key: c.key, title: c.title, icon: c.icon, name: c.tiers[c.level - 1].name, level: c.level }));
  const order = new Map(BADGE_CATEGORIES.map((c, i) => [c.key, i]));
  reached.sort((a, b) => b.level - a.level || (order.get(a.key)! - order.get(b.key)!));
  return { top: reached.slice(0, limit), total: board.earned };
}

/** Turns counts into the board. A missing or negative count is treated as 0. */
export function buildBoard(counts: BadgeCounts): BadgeBoard {
  const categories = BADGE_CATEGORIES.map((c): BoardCategory => {
    const value = Math.max(0, Math.floor(counts[c.key] ?? 0));
    const tiers = c.tiers.map((t) => ({ name: t.name, need: t.need, earned: value >= t.need }));
    const level = tiers.filter((t) => t.earned).length;
    const nextTier = c.tiers[level];
    const from = level === 0 ? 0 : c.tiers[level - 1].need;
    const progress = nextTier ? Math.min(1, Math.max(0, (value - from) / (nextTier.need - from))) : 1;
    return {
      key: c.key, group: c.group, title: c.title, icon: c.icon, counts: c.counts, value, level, tiers, progress,
      next: nextTier ? { name: nextTier.name, need: nextTier.need, remaining: nextTier.need - value, progress } : null,
    };
  });
  return { earned: categories.reduce((n, c) => n + c.level, 0), total: BADGE_CATEGORIES.reduce((n, c) => n + c.tiers.length, 0), categories };
}
