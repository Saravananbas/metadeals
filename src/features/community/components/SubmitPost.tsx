"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LIMITS } from "../validation";
import styles from "../community.module.css";

type Community = { slug: string; name: string };
const TYPES = [["DISCUSSION", "Discussion"], ["QUESTION", "Question"], ["DEAL", "Deal"]] as const;

type Node = { id: string; parentId: string | null; slug: string; name: string };

export function SubmitPost({ communities, tree, defaultCommunity }: { communities: Community[]; tree: Node[]; defaultCommunity?: string }) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number][0]>("DISCUSSION");
  const [f, setF] = useState({ communitySlug: defaultCommunity ?? tree.find((n) => !n.parentId)?.slug ?? communities[0]?.slug ?? "", title: "", body: "", url: "", merchantName: "", price: "", mrp: "", couponCode: "" });
  const [say, setSay] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mains = tree.filter((n) => !n.parentId);
  const current = tree.find((n) => n.slug === f.communitySlug);
  const mainNode = current ? (current.parentId ? tree.find((n) => n.id === current.parentId) : current) : undefined;
  const subs = mainNode ? tree.filter((n) => n.parentId === mainNode.id) : [];
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [key]: e.target.value }));
  const minor = (value: string) => Math.round(Number(value) * 100);

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setSay(null);
      try {
        const payload = {
          type, communitySlug: f.communitySlug, title: f.title, body: f.body,
          ...(type === "DEAL" ? { url: f.url, merchantName: f.merchantName || null, priceMinor: minor(f.price), mrpMinor: f.mrp ? minor(f.mrp) : null, couponCode: f.couponCode || null } : {}),
        };
        const response = await fetch("/api/v1/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          const pending = result.data.viewer?.status === "PENDING_REVIEW";
          setSay({ ok: true, text: pending ? "Thanks! A moderator will check your post before it appears." : "Posted!" });
          router.push(`/community/post/${result.data.slug}`);
        } else setSay({ ok: false, text: response.status === 401 ? "Please sign in to post." : result?.error ?? "Could not post" });
      } finally { setBusy(false); }
    }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>What do you want to share?</legend>
        <div className={styles.filters}>
          {TYPES.map(([value, label]) => <label key={value} className={`${styles.chip} ${type === value ? styles.chipActive : ""}`} style={{ cursor: "pointer" }}><input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} style={{ display: "none" }} />{label}</label>)}
        </div>
      </fieldset>
      {mains.length ? (
        <div className={styles.row}>
          <label>Main category
            <select value={mainNode?.slug ?? ""} onChange={(e) => setF((v) => ({ ...v, communitySlug: e.target.value }))} required>
              {!mainNode && <option value="">Choose a main category</option>}
              {mains.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
            </select>
          </label>
          {subs.length > 0 && mainNode && (
            <label>Sub category
              <select value={f.communitySlug} onChange={set("communitySlug")}>
                <option value={mainNode.slug}>General ({mainNode.name})</option>
                {subs.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
              </select>
            </label>
          )}
        </div>
      ) : (
        <label>Community
          <select value={f.communitySlug} onChange={set("communitySlug")} required>{communities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        </label>
      )}
      <label>Title<input value={f.title} onChange={set("title")} required minLength={5} maxLength={LIMITS.title} /></label>
      {type === "DEAL" && (
        <>
          <label>Link to the store&apos;s product page (https)<input type="url" value={f.url} onChange={set("url")} required placeholder="https://www.store.com/product" /></label>
          <div className={styles.row}>
            <label>Price you saw (₹)<input inputMode="decimal" value={f.price} onChange={set("price")} required pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
            <label>MRP (₹, optional)<input inputMode="decimal" value={f.mrp} onChange={set("mrp")} pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
            <label>Store (optional)<input value={f.merchantName} onChange={set("merchantName")} maxLength={100} /></label>
            <label>Coupon (optional)<input value={f.couponCode} onChange={set("couponCode")} maxLength={50} /></label>
          </div>
        </>
      )}
      <label>{type === "DEAL" ? "Details (optional)" : "Your post"}
        <textarea rows={6} value={f.body} onChange={set("body")} maxLength={LIMITS.body} required={type !== "DEAL"} />
      </label>
      <p className={styles.notice}>Plain text only. Links must be public https links. Do not share personal details. Posts with links from very new accounts are checked by a moderator first. Deal posts are community-shared and are not official MetaDeals4U deals. To suggest an official deal, use <Link href="/post-deal">Post a Deal</Link>.</p>
      <div className={styles.actions}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>{busy ? "Posting…" : "Post"}</button>
        {say && <span className={say.ok ? styles.ok : styles.err} role="alert">{say.text} {!say.ok && say.text.startsWith("Please sign in") && <Link href="/account">Sign in</Link>}</span>}
      </div>
    </form>
  );
}
