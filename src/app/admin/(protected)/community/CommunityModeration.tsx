"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "../submissions/submissions.module.css";

type Tab = "queue" | "reports" | "communities";
type QueuePost = { id: string; slug: string; type: string; title: string; body: string; url: string | null; version: number; createdAt: string; community: { name: string }; author: { id: string; handle: string } };
type Report = {
  id: string; targetType: "POST" | "COMMENT" | "PROFILE"; category: string; details: string | null; status: string; version: number; createdAt: string; resolution: string | null;
  reporter: { handle: string };
  post: { id: string; slug: string; title: string; status: string; version: number; locked: boolean; author: { id: string; handle: string } } | null;
  comment: { id: string; body: string; status: string; author: { id: string; handle: string } } | null;
  targetProfile: { id: string; handle: string; status: string } | null;
};
type CommunityRow = { id: string; slug: string; name: string; description: string; sortOrder: number; isActive: boolean; requiresReview: boolean; _count: { posts: number } };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.fields?.[0]?.message ?? result?.error?.message ?? "Request failed");
  return result as T;
}

export function CommunityModeration({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<Tab>("queue");
  const [reload, setReload] = useState(0);
  const [queue, setQueue] = useState<QueuePost[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => { if (alive) setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load" }); };
    if (tab === "queue") call<{ data: { items: QueuePost[] } }>("/api/v1/admin/community/queue").then((r) => alive && setQueue(r.data.items)).catch(fail);
    if (tab === "reports") call<{ data: { items: Report[]; open: number } }>("/api/v1/admin/community/reports?status=OPEN").then((r) => { if (alive) { setReports(r.data.items); setOpenCount(r.data.open); } }).catch(fail);
    if (tab === "communities" && canManage) call<{ data: CommunityRow[] }>("/api/v1/admin/community/communities").then((r) => alive && setCommunities(r.data)).catch(fail);
    return () => { alive = false; };
  }, [tab, reload, canManage]);

  const reasonOf = (key: string) => reasons[key] ?? "";
  const setReason = (key: string, value: string) => setReasons((r) => ({ ...r, [key]: value }));

  async function run(key: string, url: string, body: unknown, done: string) {
    setBusy(key); setMessage(null);
    try { await call(url, "POST", body); setMessage({ ok: true, text: done }); setReload((n) => n + 1); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Action failed" }); }
    finally { setBusy(""); }
  }

  return (
    <>
      <AdminNav active="community" />
      <main className={styles.page}>
        <div className={styles.head}>
          <h1>Community moderation</h1>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === "queue" ? styles.tabActive : ""}`} onClick={() => setTab("queue")}>Review queue</button>
            <button className={`${styles.tab} ${tab === "reports" ? styles.tabActive : ""}`} onClick={() => setTab("reports")}>Reports{tab === "reports" ? ` (${openCount})` : ""}</button>
            {canManage && <button className={`${styles.tab} ${tab === "communities" ? styles.tabActive : ""}`} onClick={() => setTab("communities")}>Communities</button>}
          </div>
        </div>
        <p className={styles.meta}>Forum posts never change official deals. Approving a post only makes it visible in the community. Official deals still go through Community Deals review and Deal Management.</p>
        {message && <div className={message.ok ? styles.notice : styles.error} role="status">{message.text}</div>}

        {tab === "queue" && (
          <>
            {!queue.length && <div className={styles.empty}>Nothing waiting for review.</div>}
            {queue.map((p) => (
              <article key={p.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
                <div>
                  <h2 className={styles.title}>{p.title}</h2>
                  <div className={styles.meta}>{p.type.toLowerCase()} in {p.community.name} · by {p.author.handle} · {new Date(p.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                  {p.url && <div className={styles.meta}>Link: {p.url}</div>}
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.body.slice(0, 600)}</p>
                  <div className={styles.grid}>
                    <label className={styles.wide}>Reason, if removing (shown to the author)<input value={reasonOf(p.id)} onChange={(e) => setReason(p.id, e.target.value)} placeholder="e.g. The link goes to a different product" /></label>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.approve} disabled={!!busy} onClick={() => void run(p.id, `/api/v1/admin/community/posts/${p.id}/approve`, { version: p.version }, "Approved and now visible.")}>Approve</button>
                    <button className={styles.reject} disabled={!!busy || reasonOf(p.id).trim().length < 5} onClick={() => void run(p.id, `/api/v1/admin/community/posts/${p.id}/remove`, { version: p.version, reason: reasonOf(p.id) }, "Removed.")}>Remove</button>
                  </div>
                </div>
              </article>
            ))}
          </>
        )}

        {tab === "reports" && (
          <>
            {!reports.length && <div className={styles.empty}>No open reports.</div>}
            {reports.map((r) => {
              const author = r.post?.author ?? r.comment?.author;
              return (
                <article key={r.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
                  <div>
                    <div className={styles.meta}><span className={styles.badge}>{r.targetType}</span> {r.category.toLowerCase().replace("_", " ")} · reported by {r.reporter.handle} · {new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                    {r.details && <p>“{r.details}”</p>}
                    {r.post && <p><Link href={`/community/post/${r.post.slug}`} target="_blank">{r.post.title}</Link> <span className={styles.meta}>({r.post.status.toLowerCase()}, by {r.post.author.handle})</span></p>}
                    {r.comment && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.comment.body}<span className={styles.meta}> ({r.comment.status.toLowerCase()}, by {r.comment.author.handle})</span></p>}
                    {r.targetProfile && <p>Member: <Link href={`/community/u/${r.targetProfile.handle}`} target="_blank">{r.targetProfile.handle}</Link> ({r.targetProfile.status.toLowerCase()})</p>}
                    <div className={styles.grid}>
                      <label className={styles.wide}>Reason or note (at least 5 characters)<input value={reasonOf(r.id)} onChange={(e) => setReason(r.id, e.target.value)} /></label>
                    </div>
                    <div className={styles.actions}>
                      {r.post && r.post.status === "PUBLISHED" && <button className={styles.reject} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "p", `/api/v1/admin/community/posts/${r.post!.id}/remove`, { version: r.post!.version, reason: reasonOf(r.id) }, "Post removed.")}>Remove post</button>}
                      {r.post && r.post.status === "PUBLISHED" && !r.post.locked && <button className={styles.tab} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "l", `/api/v1/admin/community/posts/${r.post!.id}/lock`, { version: r.post!.version, reason: reasonOf(r.id) }, "Post locked.")}>Lock</button>}
                      {r.comment && r.comment.status === "PUBLISHED" && <button className={styles.reject} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "c", `/api/v1/admin/community/comments/${r.comment!.id}/remove`, { reason: reasonOf(r.id) }, "Comment removed.")}>Remove comment</button>}
                      {canManage && author && <button className={styles.tab} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "s", `/api/v1/admin/community/members/${author.id}/suspend`, { reason: reasonOf(r.id), days: 7 }, "Member suspended for 7 days.")}>Suspend author 7 days</button>}
                      <button className={styles.approve} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "r", `/api/v1/admin/community/reports/${r.id}/resolve`, { version: r.version, outcome: "RESOLVED", resolution: reasonOf(r.id) }, "Report resolved.")}>Mark resolved</button>
                      <button className={styles.tab} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "d", `/api/v1/admin/community/reports/${r.id}/resolve`, { version: r.version, outcome: "DISMISSED", resolution: reasonOf(r.id) }, "Report dismissed.")}>Dismiss</button>
                      <button className={styles.tab} disabled={!!busy || reasonOf(r.id).trim().length < 5} onClick={() => void run(r.id + "e", `/api/v1/admin/community/reports/${r.id}/resolve`, { version: r.version, outcome: "ESCALATED", resolution: reasonOf(r.id) }, "Escalated.")}>Escalate</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </>
        )}

        {tab === "communities" && canManage && (
          <>
            <form className={styles.card} style={{ gridTemplateColumns: "1fr" }} onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const v = Object.fromEntries(new FormData(form)) as Record<string, string>;
              try {
                await call("/api/v1/admin/community/communities", "POST", { slug: v.slug, name: v.name, description: v.description, sortOrder: Number(v.sortOrder || 0), isActive: true, requiresReview: v.requiresReview === "on" });
                form.reset(); setMessage({ ok: true, text: "Community created." }); setReload((n) => n + 1);
              } catch (err) { setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not create" }); }
            }}>
              <h2 className={styles.title}>New community</h2>
              <div className={styles.grid}>
                <label>Web name (a-z, 0-9, dashes)<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
                <label>Display name<input name="name" required maxLength={60} /></label>
                <label>Sort order<input name="sortOrder" type="number" defaultValue={0} /></label>
                <label className={styles.wide}>Description<input name="description" required minLength={5} maxLength={300} /></label>
                <label><span><input name="requiresReview" type="checkbox" /> Every post needs approval</span></label>
              </div>
              <div className={styles.actions}><button className={styles.approve}>Create</button></div>
            </form>
            {communities.map((c) => (
              <article key={c.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
                <div className={styles.meta}><strong>{c.name}</strong> /{c.slug} · {c._count.posts} posts · {c.isActive ? "active" : "hidden"}{c.requiresReview ? " · posts need approval" : ""}</div>
                <p className={styles.meta}>{c.description}</p>
                <div className={styles.actions}>
                  <button className={styles.tab} onClick={() => void call(`/api/v1/admin/community/communities/${c.id}`, "PATCH", { slug: c.slug, name: c.name, description: c.description, sortOrder: c.sortOrder, isActive: !c.isActive, requiresReview: c.requiresReview }).then(() => setReload((n) => n + 1)).catch((e) => setMessage({ ok: false, text: e.message }))}>{c.isActive ? "Hide" : "Show"}</button>
                  <button className={styles.tab} onClick={() => void call(`/api/v1/admin/community/communities/${c.id}`, "PATCH", { slug: c.slug, name: c.name, description: c.description, sortOrder: c.sortOrder, isActive: c.isActive, requiresReview: !c.requiresReview }).then(() => setReload((n) => n + 1)).catch((e) => setMessage({ ok: false, text: e.message }))}>{c.requiresReview ? "Stop requiring approval" : "Require approval"}</button>
                </div>
              </article>
            ))}
          </>
        )}
      </main>
    </>
  );
}
