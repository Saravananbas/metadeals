"use client";

import { useEffect, useState } from "react";
import styles from "@/features/customer/profile.module.css";

type Item = { slug: string; title: string; priceMinor: number; store: string; state: "LIVE" | "EXPIRED" | "DRAFT" | "PENDING" | "ARCHIVED"; postedAt: string | null };
export type DealCheck = { sameLink: Item[]; pending: boolean; similar: Item[] };

const ago = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 1 ? "today" : days < 31 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
};

/** Asks the server which existing deals share this product link or look like this title (waits for a pause in typing). */
export function useDealCheck(url: string, title: string, enabled: boolean, options: { endpoint?: string; excludeDealId?: string } = {}): DealCheck | null {
  const [result, setResult] = useState<DealCheck | null>(null);
  useEffect(() => {
    const link = /^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:\/\//i, "https://") : "";
    if (!enabled || (!link && title.trim().length < 3)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${options.endpoint ?? "/api/v1/customer/deal-check"}?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title.trim())}${options.excludeDealId ? `&excludeDealId=${encodeURIComponent(options.excludeDealId)}` : ""}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null)).then((b) => { if (b?.data) setResult(b.data); }).catch(() => {});
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [url, title, enabled, options.endpoint, options.excludeDealId]);
  return result;
}

const Row = ({ d }: { d: Item }) => {
  const inner = (
    <>
      <span className={styles.simTitle}>{d.state !== "LIVE" && <b>[{d.state}] </b>}{d.title}</span>
      <strong className={styles.simPrice}>₹{(d.priceMinor / 100).toLocaleString("en-IN")}</strong>
      <small className={styles.simMeta}>{d.store} · {ago(d.postedAt)}</small>
    </>
  );
  // Drafts, pending and archived deals have no public page, so they show without a link.
  return <li>{d.state === "LIVE" || d.state === "EXPIRED"
    ? <a href={`/deal/${d.slug}`} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <span className={styles.simRow}>{inner}</span>}</li>;
};

/** The Ignore button: hides a notice for the matches it lists; a different set of matches shows it again. */
function useIgnore(key: string) {
  const [ignored, setIgnored] = useState("");
  return [ignored === key, () => setIgnored(key)] as const;
}
const IgnoreButton = ({ onClick }: { onClick: () => void }) => <button type="button" className={styles.simIgnore} onClick={onClick}>Ignore</button>;

/** "This product was already posted" notice for the link box. */
export function SameLinkNotice({ check }: { check: DealCheck | null }) {
  const [ignored, ignore] = useIgnore(check ? `${check.sameLink.map((d) => d.slug).join(",")}|${check.pending}` : "");
  if (!check || (!check.sameLink.length && !check.pending) || ignored) return null;
  return (
    <div className={styles.dupNotice} role="status">
      {check.sameLink.length > 0 && <><b>This product was already posted.</b> Check it before you post again:<ul>{check.sameLink.map((d) => <Row key={d.slug} d={d} />)}</ul></>}
      {check.pending && <p>Someone has already sent this link for review.</p>}
      <IgnoreButton onClick={ignore} />
    </div>
  );
}

/** "Similar deals on MetaDeals4U" under the title box. */
export function SimilarDeals({ check }: { check: DealCheck | null }) {
  const [ignored, ignore] = useIgnore(check ? check.similar.map((d) => d.slug).join(",") : "");
  if (!check?.similar.length || ignored) return null;
  return (
    <div className={styles.similar}>
      <p>Similar deals on MetaDeals4U</p>
      <ul>{check.similar.map((d) => <Row key={d.slug} d={d} />)}</ul>
      <IgnoreButton onClick={ignore} />
    </div>
  );
}
