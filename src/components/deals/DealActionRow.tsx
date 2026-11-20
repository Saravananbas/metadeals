"use client";

import { useEffect, useState } from "react";
import { Check, Heart, MessageCircle, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useSavedDeals } from "@/features/home/saved-store";
import { dealShareUrl } from "@/features/deals/short-link";
import { sendDealVote } from "@/features/deals/vote-client";
import type { DislikeReason } from "@/features/deals/vote-reasons";
import { DislikeMenu } from "./DislikeMenu";
import styles from "./DealExtras.module.css";

type Votes = { score: number; mine: number };

/** Good Deal? (members vote), Comments (jumps to them), Save and Share, each with a small label. */
export function DealActionRow({ dealId, slug }: { dealId: string; slug: string }) {
  const saved = useSavedDeals();
  const isSaved = saved.ids.includes(dealId);
  const [votes, setVotes] = useState<Votes>({ score: 0, mine: 0 });
  const [comments, setComments] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [needSignIn, setNeedSignIn] = useState(false);
  const api = `/api/v1/deals/${encodeURIComponent(slug)}`;

  useEffect(() => {
    const c = new AbortController();
    fetch(`${api}/vote`, { signal: c.signal, cache: "no-store" }).then((r) => r.json()).then((b) => { if (b?.data) setVotes({ score: b.data.score, mine: b.data.mine }); }).catch(() => {});
    fetch(`${api}/comments`, { signal: c.signal }).then((r) => r.json()).then((b) => setComments(b?.data?.count ?? 0)).catch(() => {});
    return () => c.abort();
  }, [api]);

  const [menu, setMenu] = useState(false);
  async function vote(value: 1 | -1 | 0, reason?: DislikeReason) {
    setNeedSignIn(false); setMenu(false);
    const result = await sendDealVote(slug, value, reason);
    if (result.status === 401) { setNeedSignIn(true); return; }
    if (result.status === 200) setVotes({ score: result.score ?? 0, mine: result.mine ?? 0 });
  }

  function share() {
    void navigator.clipboard.writeText(dealShareUrl(window.location.origin, { id: dealId, slug })).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
    void fetch(`${api}/share`, { method: "POST" }).catch(() => {});
  }

  return (
    <div className={styles.actions}>
      <div className={styles.vote}>
        <div className={styles.voteBox} role="group" aria-label="Good Deal?">
          <button type="button" className={styles.voteBtn} aria-pressed={votes.mine === 1} aria-label="Good deal" onClick={() => void vote(votes.mine === 1 ? 0 : 1)}><ThumbsUp size={18} aria-hidden="true" /></button>
          <span className={styles.score} aria-label={`Score ${votes.score}`}>{votes.score}</span>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button type="button" className={styles.voteBtn} aria-pressed={votes.mine === -1} aria-haspopup="true" aria-expanded={menu} aria-label="Not a good deal" onClick={() => (votes.mine === -1 ? void vote(0) : setMenu((open) => !open))}><ThumbsDown size={18} aria-hidden="true" /></button>
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
      <button type="button" className={styles.act} onClick={share}>
        <span className={styles.round}>{copied ? <Check size={20} aria-hidden="true" /> : <Share2 size={20} aria-hidden="true" />}</span>
        <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
      </button>
      {needSignIn && <p className={styles.hint} role="alert">Please <a href="/account">sign in</a> to vote on this deal.</p>}
    </div>
  );
}
