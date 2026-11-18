/** The three tabs of the admin deals list. A deal is in exactly one of them, worked out from its status and end date, so a deal moves to Expired by itself when its end date passes. */
export type DealTab = "active" | "expired" | "deleted";
export const DEAL_TABS: readonly DealTab[] = ["active", "expired", "deleted"];

export function classifyDeal(deal: { status: string; expiresAt: Date | string | null }, now = new Date()): DealTab {
  if (deal.status === "ARCHIVED") return "deleted";
  if (deal.status === "EXPIRED") return "expired";
  if (deal.status === "PUBLISHED" && deal.expiresAt && new Date(deal.expiresAt) <= now) return "expired";
  return "active";
}

/** The same rule as classifyDeal, as a database filter (shaped like a Prisma where clause). */
export function dealTabWhere(tab: DealTab, now = new Date()) {
  if (tab === "deleted") return { status: "ARCHIVED" as const };
  const ended = { status: "PUBLISHED" as const, expiresAt: { lte: now } };
  if (tab === "expired") return { OR: [{ status: "EXPIRED" as const }, ended] };
  return {
    OR: [
      { status: { in: ["DRAFT", "PENDING_REVIEW"] as ("DRAFT" | "PENDING_REVIEW")[] } },
      { status: "PUBLISHED" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}
