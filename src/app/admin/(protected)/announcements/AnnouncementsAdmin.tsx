"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { RichEditor } from "@/features/community/components/RichEditor";
import styles from "../submissions/submissions.module.css";

type Row = { id: string; slug: string; title: string; body: string; bodyHtml: string | null; status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED"; version: number; publishedAt: string | null; createdAt: string; createdBy: { email: string | null; name: string | null }; publishedBy: { email: string | null; name: string | null } | null };
type Publisher = { id: string; email: string | null; name: string | null; role: string; byRole: boolean; granted: boolean };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.fields?.[0]?.message ?? result?.error?.message ?? "Request failed");
  return result as T;
}
const who = (u: { email: string | null; name: string | null } | null) => (u ? u.name || u.email || "staff" : "—");

export function AnnouncementsAdmin({ canGrant }: { canGrant: boolean }) {
  const [rows, setRows] = useState<Row[]>([]), [publishers, setPublishers] = useState<Publisher[]>([]);
  const [editing, setEditing] = useState<Row | null>(null), [title, setTitle] = useState(""), [html, setHtml] = useState(""), [len, setLen] = useState(0), [seed, setSeed] = useState({ html: "", v: 0 });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setRows((await call<{ data: Row[] }>("/api/v1/admin/announcements")).data);
      if (canGrant) setPublishers((await call<{ data: Publisher[] }>("/api/v1/admin/announcements/publishers")).data);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load" }); }
  }, [canGrant]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  const reset = () => { setEditing(null); setTitle(""); setHtml(""); setLen(0); setSeed((s) => ({ html: "", v: s.v + 1 })); };
  const edit = (r: Row) => { setEditing(r); setTitle(r.title); const h = r.bodyHtml ?? `<p>${r.body.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`; setHtml(h); setSeed((s) => ({ html: h, v: s.v + 1 })); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function run(label: string, action: () => Promise<unknown>, ok: string) {
    setBusy(label); setMessage(null);
    try { await action(); setMessage({ ok: true, text: ok }); await load(); } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    setBusy("");
  }
  const save = () => run("save", async () => {
    if (editing) await call(`/api/v1/admin/announcements/${editing.id}`, "PATCH", { title, bodyHtml: html, version: editing.version });
    else await call("/api/v1/admin/announcements", "POST", { title, bodyHtml: html });
    reset();
  }, editing ? "Saved your changes." : "Saved as a draft. Publish it when you are ready.");

  return (
    <>
      <AdminNav active="announcements" />
      <main className={styles.page}>
        <div className={styles.head}><h1>Official announcements</h1></div>
        <p className={styles.meta}>Members always see these as <strong>MetaDeals4U Team</strong> with an Official badge, whichever staff member publishes them. Your own staff account is recorded privately and in the audit log for every change.</p>
        {message && <div className={message.ok ? styles.notice : styles.error} role="status">{message.text}</div>}

        <section className={styles.card} style={{ gridTemplateColumns: "1fr", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{editing ? "Edit announcement" : "New announcement"}</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={200} aria-label="Title" style={{ height: 42, border: "1px solid var(--md-c-d9d2f5)", borderRadius: 10, padding: "0 12px", font: "inherit", fontWeight: 700 }} />
          <RichEditor id="announcement-body" initialHtml={seed.html} version={seed.v} limit={8000} placeholder="Write the announcement…" minHeight={160} onChange={(h, n) => { setHtml(h); setLen(n); }} />
          <div className={styles.actions}>
            <button className={styles.approve} disabled={busy !== "" || title.trim().length < 5 || len < 10} onClick={save}>{busy === "save" ? "Saving…" : editing ? "Save changes" : "Save draft"}</button>
            {editing && <button className={styles.reject} onClick={reset}>Cancel</button>}
          </div>
        </section>

        {!rows.length && <div className={styles.empty}>No announcements yet.</div>}
        {rows.map((r) => (
          <article key={r.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <strong>{r.title}</strong> <span className={styles.badge}>{r.status === "PUBLISHED" ? "Published" : r.status === "DRAFT" ? "Draft" : "Unpublished"}</span>
              <p className={styles.meta}>Written by {who(r.createdBy)}{r.publishedBy ? ` · published by ${who(r.publishedBy)} on ${new Date(r.publishedAt ?? r.createdAt).toLocaleString("en-IN")}` : ""} · shown to members as MetaDeals4U Team</p>
              <p style={{ margin: "6px 0", maxWidth: "80ch", whiteSpace: "pre-wrap" }}>{r.body.length > 280 ? r.body.slice(0, 280) + "…" : r.body}</p>
            </div>
            <div className={styles.actions}>
              <button className={styles.tab} disabled={busy !== ""} onClick={() => edit(r)}>Edit</button>
              {r.status !== "PUBLISHED" && <button className={styles.approve} disabled={busy !== ""} onClick={() => { if (window.confirm("Publish this announcement? Every member will get a notification.")) void run(r.id, () => call(`/api/v1/admin/announcements/${r.id}/publish`, "POST", { action: "publish" }), "Published. Members have been notified."); }}>Publish</button>}
              {r.status === "PUBLISHED" && <button className={styles.reject} disabled={busy !== ""} onClick={() => { if (window.confirm("Unpublish this announcement? It disappears for members.")) void run(r.id, () => call(`/api/v1/admin/announcements/${r.id}/publish`, "POST", { action: "unpublish" }), "Unpublished."); }}>Unpublish</button>}
              <button className={styles.reject} disabled={busy !== ""} onClick={() => { if (window.confirm("Delete this announcement for good? This cannot be undone (the audit log keeps a record).")) void run(r.id, () => call(`/api/v1/admin/announcements/${r.id}`, "DELETE"), "Deleted."); }}>Delete</button>
            </div>
          </article>
        ))}

        {canGrant && (
          <section className={styles.card} style={{ gridTemplateColumns: "1fr", marginTop: 22 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Who can publish</h2>
            <p className={styles.meta}>Admins and super admins can always publish. Give an editor the <code>announcement.publish</code> permission here when needed. Every change is audited.</p>
            {publishers.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderTop: "1px solid var(--md-c-eee)", paddingTop: 8 }}>
                <span>{who(p)} <small>({p.role.toLowerCase().replace("_", " ")})</small></span>
                {p.byRole ? <small>by role</small> : (
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={p.granted} disabled={busy !== ""} onChange={(e) => void run("grant" + p.id, () => call("/api/v1/admin/announcements/publishers", "PUT", { userId: p.id, granted: e.target.checked }), e.target.checked ? "Permission granted." : "Permission removed.")} /> can publish</label>
                )}
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
