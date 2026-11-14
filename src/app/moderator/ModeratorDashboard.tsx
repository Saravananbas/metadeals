"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { REPORT_LABELS } from "@/features/community/validation";
import styles from "./moderator.module.css";

type Tab = "queue" | "reports" | "deals" | "members" | "history";
type Post = { id: string; slug: string; type: string; title: string; body: string; version: number; createdAt: string; community: { name: string }; author: { handle: string } };
type Report = { id: string; targetType: string; category: string; details: string | null; version: number; createdAt: string; reporter: { handle: string };
  post: { id: string; slug: string; title: string; status: string; version: number; locked: boolean; author: { id: string; handle: string } } | null;
  comment: { id: string; body: string; status: string; author: { id: string; handle: string } } | null;
  targetProfile: { id: string; handle: string } | null };
type Submission = { id: string; title: string; brand: string | null; description: string; productUrl: string; merchantName: string | null; priceMinor: number; mrpMinor: number | null; version: number; submittedAt: string; customer: { name: string }; imageUrl: string };
type Catalog = { categories: { id: string; name: string }[]; merchants: { id: string; name: string }[] };
type History = { actions: { id: string; action: string; reason: string; at: string }[]; activeRestrictions: { id: string; handle: string; reason: string; expiresAt: string }[] };
type Me = { status: string; probationEndsAt: string | null; daysLeft?: number | null };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.fields?.[0]?.message ?? j?.error?.message ?? "Request failed");
  return j as T;
}
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;

export function ModeratorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("queue"), [reload, setReload] = useState(0), [busy, setBusy] = useState(""), [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [me, setMe] = useState<Me | null>(null), [queue, setQueue] = useState<Post[]>([]), [reports, setReports] = useState<Report[]>([]), [subs, setSubs] = useState<Submission[]>([]), [catalog, setCatalog] = useState<Catalog | null>(null), [history, setHistory] = useState<History | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const val = (k: string) => text[k] ?? "";
  const put = (k: string, v: string) => setText((t) => ({ ...t, [k]: v }));

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => { if (alive) setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load" }); };
    void call<{ data: Me }>("/api/v1/moderator/me").then((r) => alive && setMe({ ...r.data, daysLeft: r.data.probationEndsAt ? Math.ceil((new Date(r.data.probationEndsAt).getTime() - Date.now()) / 86_400_000) : null })).catch(fail);
    if (tab === "queue") void call<{ data: { items: Post[] } }>("/api/v1/moderator/queue").then((r) => alive && setQueue(r.data.items)).catch(fail);
    if (tab === "reports") void call<{ data: { items: Report[] } }>("/api/v1/moderator/reports").then((r) => alive && setReports(r.data.items)).catch(fail);
    if (tab === "deals") {
      void call<{ data: { items: Submission[] } }>("/api/v1/moderator/submissions").then((r) => alive && setSubs(r.data.items)).catch(fail);
      void call<{ data: Catalog }>("/api/v1/moderator/catalog").then((r) => alive && setCatalog(r.data)).catch(fail);
    }
    if (tab === "history") void call<{ data: History }>("/api/v1/moderator/history").then((r) => alive && setHistory(r.data)).catch(fail);
    return () => { alive = false; };
  }, [tab, reload]);

  const run = useCallback(async (key: string, url: string, body: unknown, done: string) => {
    setBusy(key); setMessage(null);
    try { await call(url, "POST", body); setMessage({ ok: true, text: done }); setReload((n) => n + 1); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Action failed" }); }
    finally { setBusy(""); }
  }, []);
  const longEnough = (k: string, n = 5) => val(k).trim().length >= n;
  const probationDays = me?.daysLeft ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <h1>Community moderator</h1>
          <button type="button" className={styles.btn} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); router.replace("/admin/login"); }}>Sign out</button>
        </div>
      </header>
      <main className={styles.page}>
        {me?.status === "PROBATION" && <div className={styles.banner}>You are on probation{probationDays !== null ? ` (${Math.max(0, probationDays)} day${probationDays === 1 ? "" : "s"} left)` : ""}. An administrator decides whether to confirm your role; it is never confirmed automatically, and access pauses if the period ends without a decision.</div>}
        <div className={styles.tabs} role="tablist">
          {([["queue", "Review queue"], ["reports", "Reports"], ["deals", "Community deals"], ["members", "Warn or restrict"], ["history", "My history"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${styles.tab} ${tab === k ? styles.tabOn : ""}`} onClick={() => { setTab(k); setMessage(null); }}>{label}</button>
          ))}
        </div>
        {message && <div className={message.ok ? styles.note : styles.error} role="status">{message.text}</div>}

        {tab === "queue" && (<>
          {!queue.length && <div className={styles.empty}>Nothing waiting for review.</div>}
          {queue.map((p) => (
            <article key={p.id} className={styles.card}>
              <h2>{p.title}</h2>
              <div className={styles.meta}>{p.type.toLowerCase()} in {p.community.name} · by {p.author.handle} · {when(p.createdAt)}</div>
              <p className={styles.body}>{p.body.slice(0, 600)}</p>
              <div className={styles.grid}><label className={styles.wide}>Reason, if removing (the author is told)<input value={val(p.id)} onChange={(e) => put(p.id, e.target.value)} /></label></div>
              <div className={styles.actions}>
                <button className={`${styles.btn} ${styles.ok}`} disabled={!!busy} onClick={() => void run(p.id, `/api/v1/moderator/posts/${p.id}/approve`, { version: p.version }, "Approved.")}>Approve</button>
                <button className={`${styles.btn} ${styles.danger}`} disabled={!!busy || !longEnough(p.id)} onClick={() => void run(p.id, `/api/v1/moderator/posts/${p.id}/remove`, { version: p.version, reason: val(p.id) }, "Removed.")}>Remove</button>
                <button className={styles.btn} disabled={!!busy} title="Hide at once and hand to an administrator" onClick={() => { if (window.confirm("Hide this as sensitive content and send it to an administrator? Do not copy or share it.")) void run(p.id + "s", "/api/v1/moderator/sensitive", { targetType: "POST", targetId: p.id, category: "PERSONAL_DATA" }, "Hidden and escalated to an administrator."); }}>Sensitive: hide and escalate</button>
              </div>
            </article>
          ))}
        </>)}

        {tab === "reports" && (<>
          {!reports.length && <div className={styles.empty}>No open reports.</div>}
          {reports.map((r) => (
            <article key={r.id} className={styles.card}>
              <div className={styles.meta}>{r.targetType} · {(REPORT_LABELS as Record<string, string>)[r.category] ?? r.category} · {when(r.createdAt)}</div>
              {r.details && <p className={styles.body}>“{r.details}”</p>}
              {r.post && <p className={styles.body}><strong>{r.post.title}</strong> <span className={styles.meta}>({r.post.status.toLowerCase()}, by {r.post.author.handle})</span></p>}
              {r.comment && <p className={styles.quote}>{r.comment.body}</p>}
              {r.targetProfile && <p className={styles.meta}>Member: {r.targetProfile.handle}</p>}
              <div className={styles.grid}><label className={styles.wide}>Note or reason (at least 5 characters)<input value={val(r.id)} onChange={(e) => put(r.id, e.target.value)} /></label></div>
              <div className={styles.actions}>
                {r.post && r.post.status === "PUBLISHED" && <button className={`${styles.btn} ${styles.danger}`} disabled={!!busy || !longEnough(r.id)} onClick={() => void run(r.id + "p", `/api/v1/moderator/posts/${r.post!.id}/remove`, { version: r.post!.version, reason: val(r.id) }, "Post removed.")}>Remove post</button>}
                {r.comment && r.comment.status === "PUBLISHED" && <button className={`${styles.btn} ${styles.danger}`} disabled={!!busy || !longEnough(r.id)} onClick={() => void run(r.id + "c", `/api/v1/moderator/comments/${r.comment!.id}/remove`, { reason: val(r.id) }, "Comment removed.")}>Remove comment</button>}
                <button className={`${styles.btn} ${styles.ok}`} disabled={!!busy || !longEnough(r.id)} onClick={() => void run(r.id + "r", `/api/v1/moderator/reports/${r.id}/resolve`, { version: r.version, outcome: "RESOLVED", resolution: val(r.id) }, "Resolved.")}>Mark resolved</button>
                <button className={styles.btn} disabled={!!busy || !longEnough(r.id)} onClick={() => void run(r.id + "d", `/api/v1/moderator/reports/${r.id}/resolve`, { version: r.version, outcome: "DISMISSED", resolution: val(r.id) }, "Dismissed.")}>Dismiss</button>
                <button className={styles.btn} disabled={!!busy || !longEnough(r.id)} onClick={() => void run(r.id + "e", `/api/v1/moderator/reports/${r.id}/resolve`, { version: r.version, outcome: "ESCALATED", resolution: val(r.id) }, "Escalated to an administrator.")}>Escalate</button>
              </div>
            </article>
          ))}
        </>)}

        {tab === "deals" && (<>
          <p className={styles.meta}>Approving creates a draft only. An administrator or editor reviews and publishes it; you cannot publish deals.</p>
          {!subs.length && <div className={styles.empty}>No community deals waiting.</div>}
          {subs.map((s) => (
            <article key={s.id} className={styles.card}>
              <div className={styles.row}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.thumb} src={s.imageUrl} alt="" loading="lazy" />
                <div style={{ flex: 1, minWidth: 200 }}><h2>{s.title}</h2><div className={styles.meta}>by {s.customer.name} · {s.merchantName ?? "store not given"} · {rupees(s.priceMinor)}{s.mrpMinor ? ` (MRP ${rupees(s.mrpMinor)})` : ""} · {when(s.submittedAt)}</div><p className={styles.body}>{s.description.slice(0, 300)}</p></div>
              </div>
              <div className={styles.grid}>
                <label>Category<select value={val(s.id + "c")} onChange={(e) => put(s.id + "c", e.target.value)}><option value="">Choose…</option>{catalog?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label>Store<select value={val(s.id + "m")} onChange={(e) => put(s.id + "m", e.target.value)}><option value="">Choose…</option>{catalog?.merchants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className={styles.wide}>Reason, if rejecting (shown to the member)<input value={val(s.id)} onChange={(e) => put(s.id, e.target.value)} /></label>
              </div>
              <div className={styles.actions}>
                <button className={`${styles.btn} ${styles.ok}`} disabled={!!busy || !val(s.id + "c") || !val(s.id + "m")} onClick={() => void run(s.id + "a", `/api/v1/moderator/submissions/${s.id}/approve`, { version: s.version, categoryId: val(s.id + "c"), merchantId: val(s.id + "m"), title: s.title, brand: s.brand ?? "", description: s.description, productUrl: s.productUrl, priceMinor: s.priceMinor, mrpMinor: s.mrpMinor ?? s.priceMinor }, "Approved into a draft.")}>Approve into a draft</button>
                <button className={`${styles.btn} ${styles.danger}`} disabled={!!busy || !longEnough(s.id)} onClick={() => void run(s.id + "x", `/api/v1/moderator/submissions/${s.id}/reject`, { version: s.version, reason: val(s.id) }, "Rejected.")}>Reject</button>
              </div>
            </article>
          ))}
        </>)}

        {tab === "members" && (
          <form className={styles.card} onSubmit={(e) => e.preventDefault()}>
            <h2>Warn or restrict a member</h2>
            <p className={styles.meta}>A warning is private. A restriction only stops posting (discussions, comments, replies and deal submissions) for 1 to 7 days; it never suspends the account. The member is told the reason, not who acted. Start with a warning when you can.</p>
            <div className={styles.grid}>
              <label>User name<input value={val("who")} onChange={(e) => put("who", e.target.value)} maxLength={30} autoCapitalize="none" /></label>
              <label>Days (restriction)<select value={val("days") || "1"} onChange={(e) => put("days", e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
              <label className={styles.wide}>Reason (at least 5 characters)<input value={val("why")} onChange={(e) => put("why", e.target.value)} maxLength={300} /></label>
            </div>
            <div className={styles.actions}>
              <button className={styles.btn} disabled={!!busy || val("who").trim().length < 3 || !longEnough("why")} onClick={() => void run("warn", `/api/v1/moderator/members/${encodeURIComponent(val("who").trim().toLowerCase())}/warn`, { reason: val("why") }, "Warning sent.")}>Send warning</button>
              <button className={`${styles.btn} ${styles.danger}`} disabled={!!busy || val("who").trim().length < 3 || !longEnough("why")} onClick={() => { if (window.confirm(`Pause posting for ${val("days") || "1"} day(s)?`)) void run("restrict", `/api/v1/moderator/members/${encodeURIComponent(val("who").trim().toLowerCase())}/restrict`, { days: Number(val("days") || 1), reason: val("why") }, "Posting restriction applied."); }}>Restrict posting</button>
            </div>
          </form>
        )}

        {tab === "history" && history && (<>
          <article className={styles.card}>
            <h2>Restrictions you issued that are still running</h2>
            {!history.activeRestrictions.length && <p className={styles.meta}>None.</p>}
            {history.activeRestrictions.map((r) => (
              <div key={r.id} className={styles.row}>
                <div style={{ flex: 1, minWidth: 200 }}><strong>{r.handle}</strong> <span className={styles.meta}>until {when(r.expiresAt)} · {r.reason}</span></div>
                <button className={styles.btn} disabled={!!busy} onClick={() => { const why = window.prompt("Why are you lifting it? (at least 5 characters)"); if (why && why.trim().length >= 5) void run(r.id, `/api/v1/moderator/restrictions/${r.id}/revoke`, { reason: why }, "Restriction lifted."); }}>Lift</button>
              </div>
            ))}
          </article>
          <article className={styles.card}>
            <h2>Your recent actions</h2>
            {!history.actions.length && <p className={styles.meta}>Nothing yet.</p>}
            {history.actions.map((a) => <div key={a.id} className={styles.meta}>{when(a.at)} · {a.action} · {a.reason}</div>)}
          </article>
        </>)}
      </main>
    </div>
  );
}
