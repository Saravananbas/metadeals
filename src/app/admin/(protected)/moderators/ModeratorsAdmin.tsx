"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "../submissions/submissions.module.css";

type Appointment = { id: string; status: string; handle: string; version: number; extensions: number; inviteExpiresAt: string | null; acceptedAt: string | null; probationEndsAt: string | null; decisionDue: boolean; confirmedAt: string | null; revokedAt: string | null; events: { action: string; reason: string | null; at: string }[] };
type Appeal = { id: string; handle: string; targetType: string; message: string; version: number; createdAt: string; mine: boolean };
type Escalation = { id: string; targetType: string; category: string; createdAt: string };
type Restriction = { id: string; handle: string; reason: string; expiresAt: string; issuedByRole: string };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.fields?.[0]?.message ?? j?.error?.message ?? "Request failed");
  return j as T;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "–");

export function ModeratorsAdmin() {
  const [tab, setTab] = useState<"moderators" | "appeals" | "escalations" | "restrictions">("moderators"), [reload, setReload] = useState(0), [busy, setBusy] = useState("");
  const [moderators, setModerators] = useState<Appointment[]>([]), [appeals, setAppeals] = useState<Appeal[]>([]), [escalations, setEscalations] = useState<Escalation[]>([]), [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [text, setText] = useState<Record<string, string>>({}), [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null), [invite, setInvite] = useState<{ url: string; expires: string } | null>(null), [opened, setOpened] = useState<{ id: string; title: string | null; body: string | null } | null>(null);
  const val = (k: string) => text[k] ?? "";
  const put = (k: string, v: string) => setText((t) => ({ ...t, [k]: v }));

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => { if (alive) setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load" }); };
    const base = "/api/v1/admin/moderation";
    if (tab === "moderators") void call<{ data: Appointment[] }>(`${base}/moderators`).then((r) => alive && setModerators(r.data)).catch(fail);
    if (tab === "appeals") void call<{ data: Appeal[] }>(`${base}/appeals`).then((r) => alive && setAppeals(r.data)).catch(fail);
    if (tab === "escalations") void call<{ data: Escalation[] }>(`${base}/escalations`).then((r) => alive && setEscalations(r.data)).catch(fail);
    if (tab === "restrictions") void call<{ data: Restriction[] }>(`${base}/restrictions`).then((r) => alive && setRestrictions(r.data)).catch(fail);
    return () => { alive = false; };
  }, [tab, reload]);

  async function run(key: string, url: string, body: unknown, done: string) {
    setBusy(key); setMessage(null);
    try { await call(url, "POST", body); setMessage({ ok: true, text: done }); setReload((n) => n + 1); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Action failed" }); }
    finally { setBusy(""); }
  }
  const ok = (k: string, n = 5) => val(k).trim().length >= n;

  return (
    <>
      <AdminNav active="moderators" />
      <main className={styles.page}>
        <div className={styles.head}>
          <h1>Community moderators</h1>
          <div className={styles.tabs}>
            {([["moderators", "Moderators"], ["appeals", "Appeals"], ["escalations", "Hidden content"], ["restrictions", "Restrictions"]] as const).map(([k, label]) => <button key={k} className={`${styles.tab} ${tab === k ? styles.tabActive : ""}`} onClick={() => { setTab(k); setMessage(null); }}>{label}</button>)}
          </div>
        </div>
        {message && <div className={message.ok ? styles.notice : styles.error} role="status">{message.text}</div>}

        {tab === "moderators" && (<>
          <form className={styles.card} style={{ gridTemplateColumns: "1fr" }} onSubmit={async (e) => {
            e.preventDefault(); setMessage(null); setInvite(null);
            try { const r = await call<{ data: { inviteUrl: string; expiresAt: string } }>("/api/v1/admin/moderation/moderators", "POST", { handle: val("handle").trim().toLowerCase(), note: val("note") || undefined }); setInvite({ url: r.data.inviteUrl, expires: r.data.expiresAt }); put("handle", ""); put("note", ""); setReload((n) => n + 1); }
            catch (err) { setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not invite" }); }
          }}>
            <h2 className={styles.title}>Invite a member to moderate</h2>
            <p className={styles.meta}>The member must already have an account. They receive a single-use link (valid 7 days) that only they can open while signed in; they accept the guidelines, then set up a password and authenticator. They start on a 30-day probation that you must confirm, extend or revoke: it never confirms itself.</p>
            <div className={styles.grid}>
              <MemberPicker value={val("handle")} onChange={(v) => put("handle", v)} />
              <label className={styles.wide}>Note (optional, kept in the history)<input value={val("note")} onChange={(e) => put("note", e.target.value)} maxLength={300} /></label>
            </div>
            <div className={styles.actions}><button className={styles.approve}>Create invitation</button></div>
            {invite && <div className={styles.notice}>Give this link to the member now. It is shown only once and expires {when(invite.expires)}:<br /><code style={{ overflowWrap: "anywhere" }}>{invite.url}</code></div>}
          </form>
          {!moderators.length && <div className={styles.empty}>No moderator invitations or appointments yet.</div>}
          {moderators.map((a) => (
            <article key={a.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
              <div className={styles.meta}><strong>{a.handle}</strong> · <span className={styles.badge}>{a.status}</span>{a.decisionDue ? " · decision due" : ""}{a.status === "PROBATION" ? ` · probation ends ${when(a.probationEndsAt)}` : ""}{a.status === "INVITED" ? ` · invitation expires ${when(a.inviteExpiresAt)}` : ""}</div>
              <div className={styles.meta}>{a.events.map((e) => `${e.action}${e.reason ? ` (${e.reason})` : ""} ${when(e.at)}`).join(" → ")}</div>
              {["PROBATION", "CONFIRMED", "INVITED"].includes(a.status) && (<>
                <div className={styles.grid}><label className={styles.wide}>Reason or note (at least 5 characters)<input value={val(a.id)} onChange={(e) => put(a.id, e.target.value)} /></label></div>
                <div className={styles.actions}>
                  {a.status === "PROBATION" && <button className={styles.approve} disabled={!!busy || (a.probationEndsAt !== null && new Date(a.probationEndsAt) > new Date())} title="Only after the probation period has ended" onClick={() => void run(a.id, `/api/v1/admin/moderation/moderators/${a.id}/confirm`, { version: a.version, note: val(a.id) || undefined }, "Moderator confirmed.")}>Confirm</button>}
                  {a.status === "PROBATION" && <button className={styles.tab} disabled={!!busy || !ok(a.id) || a.extensions >= 2} onClick={() => void run(a.id + "e", `/api/v1/admin/moderation/moderators/${a.id}/extend`, { version: a.version, days: 14, reason: val(a.id) }, "Probation extended by 14 days.")}>Extend 14 days{a.extensions ? ` (${a.extensions}/2 used)` : ""}</button>}
                  <button className={styles.reject} disabled={!!busy || !ok(a.id)} onClick={() => { if (window.confirm("Revoke now? Access ends immediately and open sessions are closed.")) void run(a.id + "r", `/api/v1/admin/moderation/moderators/${a.id}/revoke`, { version: a.version, reason: val(a.id) }, "Revoked. Access ended."); }}>Revoke</button>
                </div>
              </>)}
            </article>
          ))}
        </>)}

        {tab === "appeals" && (<>
          {!appeals.length && <div className={styles.empty}>No open appeals.</div>}
          {appeals.map((a) => (
            <article key={a.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
              <div className={styles.meta}><span className={styles.badge}>{a.targetType}</span> appeal by <strong>{a.handle}</strong> · {when(a.createdAt)}{a.mine ? " · you took the original action, so another administrator must decide" : ""}</div>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{a.message}</p>
              <div className={styles.grid}><label className={styles.wide}>Decision note (shown to the member, at least 5 characters)<input value={val(a.id)} onChange={(e) => put(a.id, e.target.value)} /></label></div>
              <div className={styles.actions}>
                <button className={styles.approve} disabled={!!busy || a.mine || !ok(a.id)} onClick={() => void run(a.id + "o", `/api/v1/admin/moderation/appeals/${a.id}/decide`, { version: a.version, outcome: "OVERTURNED", note: val(a.id) }, "Appeal accepted; the action was undone.")}>Accept appeal (undo the action)</button>
                <button className={styles.tab} disabled={!!busy || a.mine || !ok(a.id)} onClick={() => void run(a.id + "u", `/api/v1/admin/moderation/appeals/${a.id}/decide`, { version: a.version, outcome: "UPHELD", note: val(a.id) }, "Appeal declined.")}>Decline appeal</button>
              </div>
            </article>
          ))}
        </>)}

        {tab === "escalations" && (<>
          <p className={styles.meta}>Content moderators hid as sensitive. It is not public and not copied anywhere. Opening it is recorded in the audit log.</p>
          {!escalations.length && <div className={styles.empty}>Nothing escalated.</div>}
          {escalations.map((x) => (
            <article key={x.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
              <div className={styles.meta}><span className={styles.badge}>{x.targetType}</span> {x.category.toLowerCase().replace("_", " ")} · {when(x.createdAt)}</div>
              {opened?.id === x.id && <blockquote style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{opened.title ? <strong>{opened.title}<br /></strong> : null}{opened.body ?? "(no longer available)"}</blockquote>}
              <div className={styles.actions}>
                <button className={styles.tab} onClick={() => void call<{ data: { title: string | null; body: string | null } }>(`/api/v1/admin/moderation/escalations/${x.id}`).then((r) => setOpened({ id: x.id, ...r.data })).catch((e) => setMessage({ ok: false, text: e.message }))}>Open (audited)</button>
                <button className={styles.approve} disabled={!!busy} onClick={() => void run(x.id, `/api/v1/admin/moderation/escalations/${x.id}/close`, {}, "Marked handled.")}>Mark handled</button>
              </div>
            </article>
          ))}
        </>)}

        {tab === "restrictions" && (<>
          {!restrictions.length && <div className={styles.empty}>No posting restrictions are running.</div>}
          {restrictions.map((r) => (
            <article key={r.id} className={styles.card} style={{ gridTemplateColumns: "1fr" }}>
              <div className={styles.meta}><strong>{r.handle}</strong> · until {when(r.expiresAt)} · by a {r.issuedByRole === "COMMUNITY_MODERATOR" ? "moderator" : "administrator"} · {r.reason}</div>
              <div className={styles.grid}><label className={styles.wide}>Reason for lifting (at least 5 characters)<input value={val(r.id)} onChange={(e) => put(r.id, e.target.value)} /></label></div>
              <div className={styles.actions}><button className={styles.tab} disabled={!!busy || !ok(r.id)} onClick={() => void run(r.id, `/api/v1/admin/moderation/restrictions/${r.id}/revoke`, { reason: val(r.id) }, "Restriction lifted.")}>Lift restriction</button></div>
            </article>
          ))}
        </>)}
      </main>
    </>
  );
}

type Suggestion = { handle: string; displayName: string | null; avatarUrl: string | null; alreadyModerator: boolean };
/** Type-ahead over registered members: shows user names (never emails) as the administrator types; the choice is still checked again on the server. */
function MemberPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<Suggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1), [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = value.trim().replace(/^@/, "");
    if (!open || q.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/v1/admin/moderation/members?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { data: [] })).then((b) => { setItems(b.data ?? []); setActive(-1); })
        .catch(() => {}).finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, open]);
  const pick = (s: Suggestion) => { if (s.alreadyModerator) return; onChange(s.handle); setOpen(false); };
  const shown = open && value.trim().length > 0;
  return (
    <label style={{ position: "relative" }}>Member user name
      <input value={value} role="combobox" aria-expanded={shown} aria-controls="member-suggestions" aria-autocomplete="list" autoComplete="off" required minLength={3} maxLength={30}
        placeholder="Start typing a user name"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && active >= 0 && items[active]) { e.preventDefault(); pick(items[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {shown && (items.length > 0 || loading) && (
        <ul id="member-suggestions" role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, margin: 4, padding: 4, listStyle: "none", background: "var(--md-white)", border: "1px solid var(--md-purple-200)", borderRadius: 12, maxHeight: 280, overflowY: "auto" }}>
          {items.map((s, i) => (
            <li key={s.handle} role="option" aria-selected={i === active} aria-disabled={s.alreadyModerator}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: s.alreadyModerator ? "not-allowed" : "pointer", opacity: s.alreadyModerator ? 0.55 : 1, background: i === active ? "var(--md-purple-50)" : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.avatarUrl ? <img src={s.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <span aria-hidden style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--md-purple-100)", display: "grid", placeItems: "center", fontWeight: 700 }}>{s.handle.slice(0, 1).toUpperCase()}</span>}
              <span><strong>{s.displayName || s.handle}</strong><br /><small>@{s.handle}{s.alreadyModerator ? " · already invited or a moderator" : ""}</small></span>
            </li>
          ))}
          {loading && !items.length && <li style={{ padding: 8 }}>Searching…</li>}
        </ul>
      )}
    </label>
  );
}
