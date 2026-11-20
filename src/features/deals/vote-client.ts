import type { DislikeReason } from "./vote-reasons";

export type VoteResult = { status: number; score?: number; up?: number; mine?: number; error?: string };

/** Sends a Good Deal vote (1, -1 or 0 to clear). A down vote carries the reason the member chose. */
export async function sendDealVote(slug: string, value: 1 | -1 | 0, reason?: DislikeReason): Promise<VoteResult> {
  try {
    const response = await fetch(`/api/v1/deals/${encodeURIComponent(slug)}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reason ? { value, reason } : { value }) });
    const body = await response.json().catch(() => null);
    // Tell the other vote buttons on the page (action row and top bar) so they stay in step.
    if (response.ok && body?.data && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("deal-vote", { detail: { slug, score: body.data.score, up: body.data.up, mine: body.data.mine } }));
    return { status: response.status, score: body?.data?.score, up: body?.data?.up, mine: body?.data?.mine, error: body?.error };
  } catch {
    return { status: 0, error: "Could not reach the server." };
  }
}
