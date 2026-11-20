"use client";

import { useEffect, useState } from "react";
import styles from "../profile.module.css";

type Item = { slug: string; title: string; priceMinor: number; store: string; state: "LIVE" | "EXPIRED"; postedAt: string | null };
export type DealCheck = { sameLink: Item[]; pending: boolean; similar: Item[] };

const ago = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 1 ? "today" : days < 31 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
};

/** Asks the server which existing deals share this product link or look like this title (waits for a pause in typing). */
export function useDealCheck(url: string, title: string, enabled: boolean): DealCheck | null {
  const [result, setResult] = useState<DealCheck | null>(null);
  useEffect(() => {
    const link = /^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:\/\//i, "https://") : "";
    if (!enabled || (!link && title.trim().length < 3)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/customer/deal-check?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title.trim())}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null)).then((b) => { if (b?.data) setResult(b.data); }).catch(() => {});
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [url, title, enabled]);
  return result;
}

const Row = ({ d }: { d: Item }) => (
  <li><a href={`/deal/${d.slug}`} target="_blank" rel="noopener noreferrer">
    {d.state === "EXPIRED" && <b>[EXPIRED] </b>}{d.title} <strong>₹{(d.priceMinor / 100).toLocaleString("en-IN")}</strong> <small>{d.store} · {ago(d.postedAt)}</small>
  </a></li>
);

/** "This product was already posted" notice for the link box. */
export function SameLinkNotice({ check }: { check: DealCheck | null }) {
  if (!check || (!check.sameLink.length && !check.pending)) return null;
  return (
    <div className={styles.dupNotice} role="status">
      {check.sameLink.length > 0 && <><b>This product was already posted.</b> Check it before you post again:<ul>{check.sameLink.map((d) => <Row key={d.slug} d={d} />)}</ul></>}
      {check.pending && <p>Someone has already sent this link for review.</p>}
    </div>
  );
}

/** "Similar deals on MetaDeals4U" under the title box. */
export function SimilarDeals({ check }: { check: DealCheck | null }) {
  if (!check?.similar.length) return null;
  return (
    <div className={styles.similar}>
      <p>Similar deals on MetaDeals4U</p>
      <ul>{check.similar.map((d) => <Row key={d.slug} d={d} />)}</ul>
    </div>
  );
}
