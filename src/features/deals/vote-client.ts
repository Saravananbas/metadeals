import type { DislikeReason } from "./vote-reasons";

export type VoteResult = { status: number; score?: number; up?: number; down?: number; liked?: boolean; disliked?: boolean; mine?: number; error?: string };

/** Likes and dislikes are separate: 1 adds a like, -1 adds a dislike (with the reason chosen), and 0 with `clear` (1 or -1) takes that one back. */
export async function sendDealVote(slug: string, value: 1 | -1 | 0, reason?: DislikeReason, clear?: 1 | -1): Promise<VoteResult> {
  try {
    const response = await fetch(`/api/v1/deals/${encodeURIComponent(slug)}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, ...(reason ? { reason } : {}), ...(clear ? { clear } : {}) }) });
    const body = await response.json().catch(() => null);
    // Tell the other vote buttons on the page (action row and top bar) so they stay in step.
    if (response.ok && body?.data && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("deal-vote", { detail: { slug, up: body.data.up, down: body.data.down, liked: body.data.liked, disliked: body.data.disliked } }));
    return { status: response.status, score: body?.data?.score, up: body?.data?.up, down: body?.data?.down, liked: body?.data?.liked, disliked: body?.data?.disliked, mine: body?.data?.mine, error: body?.error };
  } catch {
    return { status: 0, error: "Could not reach the server." };
  }
}
