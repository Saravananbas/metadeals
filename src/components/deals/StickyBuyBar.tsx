"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { sendDealVote } from "@/features/deals/vote-client";
import type { DislikeReason } from "@/features/deals/vote-reasons";
import { DislikeMenu } from "./DislikeMenu";
import styles from "./DealExtras.module.css";

/** Appears at the top once the main Buy Now button scrolls out of view, so shoppers can buy without scrolling back up. */
export function StickyBuyBar({ title, price, mrp, savings, slug, merchantName, imageUrl, href }: { title: string; price: string; mrp?: string; savings?: string; slug: string; merchantName: string; imageUrl: string; href: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [votes, setVotes] = useState({ score: 0, mine: 0 });
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/v1/deals/${encodeURIComponent(slug)}/vote`, { signal: c.signal, cache: "no-store" }).then((r) => r.json()).then((b) => { if (b?.data) setVotes({ score: b.data.score, mine: b.data.mine }); }).catch(() => {});
    const on = (e: Event) => { const d = (e as CustomEvent<{ slug: string; score: number; mine: number }>).detail; if (d.slug === slug) setVotes({ score: d.score, mine: d.mine }); };
    window.addEventListener("deal-vote", on);
    return () => { c.abort(); window.removeEventListener("deal-vote", on); };
  }, [slug]);
  async function vote(value: 1 | -1 | 0, reason?: DislikeReason) {
    setMenu(false);
    const result = await sendDealVote(slug, value, reason);
    if (result.status === 401) router.push("/account");
  }
  useEffect(() => {
    const target = document.getElementById("buy-now-btn");
    if (!target || typeof IntersectionObserver === "undefined") return;
    // The sticky site header covers the top ~110px, so a button under it counts as gone. Not shown while the button is still below the fold.
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.bottom < 110), { rootMargin: "-110px 0px 0px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={`${styles.sticky} ${show ? styles.stickyShown : ""}`} aria-hidden={!show}>
      <div className={styles.stickyInner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.stickyThumb} src={imageUrl} alt="" width={40} height={40} loading="lazy" />
        <div className={styles.stickyTitle}><strong>{title}</strong><span>at {merchantName}</span></div>
        <div className={styles.stickyVote} role="group" aria-label="Good Deal?">
          <button type="button" className={styles.voteBtn} aria-pressed={votes.mine === 1} aria-label="Good deal" tabIndex={show ? 0 : -1} onClick={() => void vote(votes.mine === 1 ? 0 : 1)}><ThumbsUp size={17} aria-hidden="true" /></button>
          <span className={styles.score}>{votes.score}</span>
          <button type="button" className={styles.voteBtn} aria-pressed={votes.mine === -1} aria-haspopup="true" aria-expanded={menu} aria-label="Not a good deal" tabIndex={show ? 0 : -1} onClick={() => (votes.mine === -1 ? void vote(0) : setMenu((o) => !o))}><ThumbsDown size={17} aria-hidden="true" /></button>
          {menu && <DislikeMenu down onPick={(reason) => void vote(-1, reason)} onClose={() => setMenu(false)} />}
        </div>
        {(mrp || savings) && <div className={styles.stickyPrices}>{mrp && <del>MRP {mrp}</del>}{savings && <span>{savings}</span>}</div>}
        <span className={styles.stickyPrice}>{price}</span>
        <a className={styles.stickyBuy} href={href} target="_blank" rel="sponsored noopener noreferrer" tabIndex={show ? 0 : -1}>Buy Now</a>
      </div>
    </div>
  );
}
