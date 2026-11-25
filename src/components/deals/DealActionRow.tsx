"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useSavedDeals } from "@/features/home/saved-store";
import { publicDealUrl } from "@/features/deals/share-card/message";
import type { ShareDealData } from "@/features/deals/share-card/types";
import { ShareDealModal } from "./ShareDealModal";
import { sendDealVote } from "@/features/deals/vote-client";
import type { DislikeReason } from "@/features/deals/vote-reasons";
import { DislikeMenu } from "./DislikeMenu";
import styles from "./DealExtras.module.css";

type Votes = { up: number; down: number; liked: boolean; disliked: boolean };

/** Good Deal? (members vote), Comments (jumps to them), Save and Share, each with a small label. */
export function DealActionRow({ dealId, slug, shareData }: { dealId: string; slug: string; shareData: ShareDealData }) {
  const saved = useSavedDeals();
  const isSaved = saved.ids.includes(dealId);
  const [votes, setVotes] = useState<Votes>({ up: 0, down: 0, liked: false, disliked: false });
  const [comments, setComments] = useState<number | null>(null);
  const api = `/api/v1/deals/${encodeURIComponent(slug)}`;

  useEffect(() => {
    const c = new AbortController();
    fetch(`${api}/vote`, { signal: c.signal, cache: "no-store" }).then((r) => r.json()).then((b) => { if (b?.data) setVotes({ up: b.data.up, down: b.data.down, liked: Boolean(b.data.liked), disliked: Boolean(b.data.disliked) }); }).catch(() => {});
    fetch(`${api}/comments`, { signal: c.signal }).then((r) => r.json()).then((b) => setComments(b?.data?.count ?? 0)).catch(() => {});
    return () => c.abort();
  }, [api]);

  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ slug: string; up: number; down: number; liked: boolean; disliked: boolean }>).detail; if (d.slug === slug) setVotes({ up: d.up, down: d.down, liked: d.liked, disliked: d.disliked }); };
    window.addEventListener("deal-vote", on);
    return () => window.removeEventListener("deal-vote", on);
  }, [slug]);
  async function vote(value: 1 | -1 | 0, reason?: DislikeReason, clear?: 1 | -1) {
    setMenu(false);
    const result = await sendDealVote(slug, value, reason, clear);
    if (result.status === 200) setVotes({ up: result.up ?? 0, down: result.down ?? 0, liked: Boolean(result.liked), disliked: Boolean(result.disliked) });
  }

  const [shareOpen, setShareOpen] = useState(false);
  const count = () => { void fetch(`${api}/share`, { method: "POST" }).catch(() => {}); };

  return (
    <div className={styles.actions}>
      <div className={styles.vote}>
        <div className={styles.voteBox} role="group" aria-label="Good Deal?">
          <button type="button" className={styles.voteBtn} aria-pressed={votes.liked} aria-label="Good deal" onClick={() => void (votes.liked ? vote(0, undefined, 1) : vote(1))}><ThumbsUp size={18} aria-hidden="true" /><span className={styles.count} aria-label={`${votes.up} likes`}>{votes.up}</span></button>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button type="button" className={styles.voteBtn} aria-pressed={votes.disliked} aria-haspopup="true" aria-expanded={menu} aria-label="Not a good deal" onClick={() => (votes.disliked ? void vote(0, undefined, -1) : setMenu((open) => !open))}><ThumbsDown size={18} aria-hidden="true" /><span className={styles.count} aria-label={`${votes.down} dislikes`}>{votes.down}</span></button>
            {menu && <DislikeMenu onPick={(reason) => void vote(-1, reason)} onClose={() => setMenu(false)} />}
          </span>
        </div>
        <span className={styles.label}>Good Deal?</span>
      </div>
      <a className={styles.act} href="#comments">
        <span className={styles.round}><MessageCircle size={20} aria-hidden="true" /></span>
        <span>Comments{comments !== null ? ` (${comments})` : ""}</span>
      </a>
      <button type="button" className={`${styles.act} ${isSaved ? styles.on : ""}`} aria-pressed={isSaved} onClick={() => saved.toggle(dealId)}>
        <span className={styles.round}><Heart size={20} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" /></span>
        <span>{isSaved ? "Saved" : "Save"}</span>
      </button>
      {shareOpen && <ShareDealModal deal={shareData} url={publicDealUrl(window.location.origin, { id: dealId, slug })} onShared={count} onClose={() => setShareOpen(false)} />}
      <button type="button" className={styles.act} onClick={() => setShareOpen(true)}>
        <span className={styles.round}><Share2 size={20} aria-hidden="true" /></span>
        <span>Share</span>
      </button>
    </div>
  );
}
