"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./submissions.module.css";

type Status = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
type Item = {
  id: string; status: Status; title: string; brand: string | null; description: string; productUrl: string; merchantName: string | null; categoryHint: string | null;
  priceMinor: number; mrpMinor: number | null; couponCode: string | null; version: number; resubmissions: number; submittedAt: string; rejectionReason: string | null;
  dealId: string | null; imageUrl: string; customer: { name: string; email: string }; deal: { status: string; everPublished: boolean } | null; _count?: { extraImages: number };
};
type Option = { id: string; name: string; slug?: string; websiteUrl?: string; parentId?: string | null };
const host = (u: string) => { try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
type Draft = { categoryId: string; merchantId: string; title: string; brand: string; description: string; productUrl: string; price: string; mrp: string; coupon: string; reason: string };

const rupees = (minor: number | null) => (minor == null ? "" : String(minor / 100));
const blankDraft = (item: Item): Draft => ({
  categoryId: "", merchantId: "", title: item.title, brand: item.brand ?? "", description: item.description, productUrl: item.productUrl,
  price: rupees(item.priceMinor), mrp: rupees(item.mrpMinor), coupon: item.couponCode ?? "", reason: "",
});
const toMinor = (value: string) => Math.round(Number(value) * 100);

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.fields?.[0]?.message ?? result?.error?.message ?? "Request failed");
  return result as T;
}

export function SubmissionsReview() {
  const [status, setStatus] = useState<Status>("PENDING_REVIEW");
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState(0);
  const [categories, setCategories] = useState<Option[]>([]);
  const [merchants, setMerchants] = useState<Option[]>([]);
  const [directory, setDirectory] = useState<Option[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    call<{ data: { items: Item[]; pending: number } }>(`/api/v1/admin/submissions?status=${status}`)
      .then((result) => {
        if (!alive) return;
        setItems(result.data.items);
        setPending(result.data.pending);
        setDrafts((previous) => {
          const next = { ...previous };
          for (const item of result.data.items) next[item.id] ??= blankDraft(item);
          return next;
        });
      })
      .catch((e) => { if (alive) setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not load submissions." }); });
    return () => { alive = false; };
  }, [status, reloadKey]);

  useEffect(() => {
    let alive = true;
    Promise.all([call<{ data: Option[] }>("/api/v1/admin/categories"), call<{ data: Option[] }>("/api/v1/admin/merchants")])
      .then(([c, m]) => { if (alive) { setCategories(c.data); setMerchants(m.data); } })
      .catch(() => {});
    // The Merchant Website Directory (public list of active stores): stores that are not a Merchant yet can be picked too.
    fetch("/api/v1/catalog", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive) setDirectory((b?.merchantWebsites ?? []).map((w: { id: string; name: string; domain: string }) => ({ id: `dir:${w.id}`, name: w.name, websiteUrl: w.domain }))); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Pre-select the store (from the product link or the name the customer wrote) and the category (the one the customer chose). Anything unmatched stays on "Select…".
  const withSuggestions = (item: Item): Draft => {
    const d = drafts[item.id] ?? blankDraft(item);
    const h = host(item.productUrl), written = norm(item.merchantName ?? "");
    const merchant = d.merchantId ? undefined : [...merchants, ...directory.filter((w) => !merchants.some((m) => m.websiteUrl && host(m.websiteUrl) === host(w.websiteUrl ?? "")))].find((m) => (m.websiteUrl && host(m.websiteUrl) === h) || (written && norm(m.name) === written) || (h && norm(m.name).length > 2 && norm(h).startsWith(norm(m.name))));
    const category = d.categoryId || !item.categoryHint ? undefined : categories.find((c) => norm(c.name) === norm(item.categoryHint ?? ""));
    return { ...d, merchantId: d.merchantId || merchant?.id || "", categoryId: d.categoryId || category?.id || "" };
  };

  // Directory stores that already have a Merchant are left out (the Merchant is used).
  // A directory store and a Merchant are the same store when they share a website or a name.
  const sameStore = (m: Option, w: Option) => (Boolean(m.websiteUrl) && host(m.websiteUrl ?? "") === host(w.websiteUrl ?? "")) || norm(m.name) === norm(w.name);
  const storeOptions = [
    ...directory.map((w) => ({ id: merchants.find((m) => sameStore(m, w))?.id ?? w.id, name: w.name })),
    ...merchants.filter((m) => !directory.some((w) => sameStore(m, w))).map((m) => ({ id: m.id, name: m.name })),
  ].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i).sort((a, b) => a.name.localeCompare(b.name));
  const mainCategories = categories.filter((c) => !c.parentId);
  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  async function act(item: Item, kind: "approve" | "reject", publish = false) {
    const d = withSuggestions(item);
    setBusy(item.id + kind);
    setMessage(null);
    try {
      if (kind === "approve") {
        const approved = await call<{ data: { dealId: string } }>(`/api/v1/admin/submissions/${item.id}/approve`, "POST", {
          version: item.version, categoryId: d.categoryId, merchantId: d.merchantId, title: d.title, brand: d.brand, description: d.description, productUrl: d.productUrl,
          priceMinor: toMinor(d.price), mrpMinor: toMinor(d.mrp), couponCode: d.coupon || null,
        });
        if (publish) {
          // Same gate as Deal Management: preview the saved draft, then publish with that preview token.
          try {
            const prev = await call<{ data: { version: number }; previewToken: string }>(`/api/v1/admin/deals/${approved.data.dealId}/preview`, "POST", {});
            await call(`/api/v1/admin/deals/${approved.data.dealId}/publish`, "POST", { version: prev.data.version, previewToken: prev.previewToken });
            setMessage({ kind: "ok", text: "Approved and published. It is live on the home page now (or scheduled by its dates)." });
          } catch (error) {
            setMessage({ kind: "error", text: `Approved and saved as a draft, but publishing failed: ${error instanceof Error ? error.message : "unknown error"}. Open Deal Management and press Publish.` });
          }
        } else {
          setMessage({ kind: "ok", text: "Approved as a draft. It is not on the home page yet: press Publish in Deal Management (or use Approve and publish next time)." });
        }
      } else {
        await call(`/api/v1/admin/submissions/${item.id}/reject`, "POST", { version: item.version, reason: d.reason });
        setMessage({ kind: "ok", text: "Rejected. The customer can see your reason and resubmit." });
      }
      load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <AdminNav active="submissions" />
      <main className={styles.page}>
        <div className={styles.head}>
          <h1>Community deals</h1>
          <div className={styles.tabs}>
            {([["PENDING_REVIEW", `Awaiting review (${pending})`], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]] as const).map(([key, label]) => (
              <button key={key} className={`${styles.tab} ${status === key ? styles.tabActive : ""}`} onClick={() => setStatus(key)}>{label}</button>
            ))}
          </div>
        </div>
        <p className={styles.meta}>Approving creates an ordinary draft deal. It stays private until you preview and publish it in Deal Management.</p>
        {message && <div className={message.kind === "ok" ? styles.notice : styles.error} role="status">{message.text}</div>}
        {!items.length && <div className={styles.empty}>Nothing here.</div>}

        {items.map((item) => {
          const d = withSuggestions(item);
          if (!d) return null;
          return (
            <article key={item.id} className={styles.card}>
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.thumb} src={item.imageUrl} alt={item.title} />
                {(item._count?.extraImages ?? 0) > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }} aria-label={`${item._count?.extraImages} more pictures`}>
                  {Array.from({ length: item._count?.extraImages ?? 0 }, (_, i) => (
                    <a key={i} href={`${item.imageUrl}?n=${i + 1}`} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${item.imageUrl}?n=${i + 1}`} alt={`Extra picture ${i + 1}`} width={56} height={56} style={{ objectFit: "cover", borderRadius: 8 }} loading="lazy" />
                    </a>
                  ))}
                </div>}
              </div>
              <div>
                <h2 className={styles.title}>{item.title}</h2>
                <div className={styles.meta}>
                  By {item.customer.name} ({item.customer.email}) · {new Date(item.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  {item.resubmissions > 0 ? ` · resubmitted ${item.resubmissions}×` : ""} · <span className={styles.badge}>{item.status.replace("_", " ")}</span>
                </div>
                <div className={styles.meta}>Customer wrote store: {item.merchantName ?? "–"} · category: {item.categoryHint ?? "–"} · <a href={item.productUrl} target="_blank" rel="noopener noreferrer">open link ↗</a></div>
                {item.status === "REJECTED" && <p className={styles.meta}>Reason given: {item.rejectionReason}</p>}
                {item.status === "APPROVED" && <p className={styles.meta}>Draft deal {item.deal?.everPublished ? "has been published" : "awaits publishing"}. <Link href="/admin/deals">Open Deal Management</Link></p>}

                {item.status === "PENDING_REVIEW" && (
                  <>
                    <div className={styles.grid}>
                      {(() => {
                        const chosen = categories.find((c) => c.id === d.categoryId);
                        const main = chosen?.parentId ? categories.find((c) => c.id === chosen.parentId) : chosen;
                        const subs = main ? categories.filter((c) => c.parentId === main.id) : [];
                        return <>
                          <label>Category<select value={main?.id ?? ""} onChange={(e) => set(item.id, { categoryId: e.target.value })}><option value="">Select…</option>{mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                          <label>Sub-category<select value={chosen?.parentId ? chosen.id : ""} disabled={!main || subs.length === 0} onChange={(e) => set(item.id, { categoryId: e.target.value || main?.id || "" })}><option value="">{main && subs.length === 0 ? "No sub-categories" : "None"}</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                        </>;
                      })()}
                      <label>Store<select value={d.merchantId} onChange={(e) => set(item.id, { merchantId: e.target.value })}><option value="">Select…</option>{(storeOptions.length ? storeOptions : merchants).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                      <label>Deal price (₹)<input inputMode="decimal" value={d.price} onChange={(e) => set(item.id, { price: e.target.value })} /></label>
                      <label>MRP (₹, required)<input inputMode="decimal" value={d.mrp} onChange={(e) => set(item.id, { mrp: e.target.value })} /></label>
                      <label>Brand<input value={d.brand} onChange={(e) => set(item.id, { brand: e.target.value })} /></label>
                      <label>Coupon<input value={d.coupon} onChange={(e) => set(item.id, { coupon: e.target.value })} /></label>
                      <label className={styles.wide}>Title<input value={d.title} onChange={(e) => set(item.id, { title: e.target.value })} /></label>
                      <label className={styles.wide}>Product link<input value={d.productUrl} onChange={(e) => set(item.id, { productUrl: e.target.value })} /></label>
                      <label className={styles.wide}>Description<textarea rows={3} value={d.description} onChange={(e) => set(item.id, { description: e.target.value })} /></label>
                      <label className={styles.wide}>Reason, if rejecting (shown to the customer)<input value={d.reason} onChange={(e) => set(item.id, { reason: e.target.value })} placeholder="e.g. The price on the store page is different" /></label>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.approve} disabled={!!busy || !d.categoryId || !d.merchantId || !d.mrp} onClick={() => void act(item, "approve", true)}>Approve and publish</button>
                      <button className={styles.approve} disabled={!!busy || !d.categoryId || !d.merchantId || !d.mrp} onClick={() => void act(item, "approve")}>Approve as draft</button>
                      <button className={styles.reject} disabled={!!busy || d.reason.trim().length < 5} onClick={() => void act(item, "reject")}>Reject</button>
                    </div>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </main>
    </>
  );
}
