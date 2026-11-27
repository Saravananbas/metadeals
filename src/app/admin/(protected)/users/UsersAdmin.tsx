"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./users.module.css";

type Member = { id: string; name: string; email: string; handle: string | null; joinedAt: string; lastSeenAt: string | null; emailVerified: boolean; status: string; signInMethods: string[]; comments: number; votes: number; saved: number; submissions: number };
type Visit = { id: string; startedAt: string; lastSeenAt: string; pages: number; seconds: number; entry: string; exit: string; source: string; device: string; browser: string; os: string; returning: boolean; visitor: string | null };
type Page<T> = { data: T[]; page: number; total: number; totalPages: number };
type VisitorPage = Page<Visit> & { summary: { days: number; anonymousVisits: number; signedInVisits: number; uniqueTrackedVisitors: number } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "–");
const duration = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

async function load<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "Could not load the list.");
  return body as T;
}

/** Admin "Users": registered members (details visible to Super Administrators and Administrators only) and anonymous visits. */
export function UsersAdmin() {
  const [tab, setTab] = useState<"members" | "visitors">("members");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(7);
  const [members, setMembers] = useState<Page<Member> | null>(null);
  const [visitors, setVisitors] = useState<VisitorPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let alive = true;
    setLoading(true); setError(null);
    const request = tab === "members"
      ? load<Page<Member>>(`/api/v1/admin/users/members?page=${page}&q=${encodeURIComponent(query)}`).then((r) => alive && setMembers(r))
      : load<VisitorPage>(`/api/v1/admin/users/visitors?page=${page}&days=${days}`).then((r) => alive && setVisitors(r));
    request.catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not load the list.")).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tab, page, query, days]);
  useEffect(() => refresh(), [refresh]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); setQuery(search.trim()); }
  function switchTab(next: "members" | "visitors") { setTab(next); setPage(1); }

  const current = tab === "members" ? members : visitors;

  return (
    <>
      <AdminNav />
      <main className={styles.page}>
        <header className={styles.head}>
          <div>
            <h1>Users</h1>
            <p className={styles.sub}>People registered on MetaDeals4U, and visitors who are not signed in.</p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Users">
            <button type="button" role="tab" aria-selected={tab === "members"} className={`${styles.tab} ${tab === "members" ? styles.tabOn : ""}`} onClick={() => switchTab("members")}>Registered members</button>
            <button type="button" role="tab" aria-selected={tab === "visitors"} className={`${styles.tab} ${tab === "visitors" ? styles.tabOn : ""}`} onClick={() => switchTab("visitors")}>Anonymous visitors</button>
          </div>
        </header>

        {tab === "members" && (
          <form className={styles.toolbar} onSubmit={submitSearch}>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email or user name" maxLength={80} aria-label="Search members" />
            <button type="submit" className={styles.primary}>Search</button>
            {query && <button type="button" className={styles.link} onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>Clear</button>}
            <span className={styles.count}>{members ? `${members.total} member${members.total === 1 ? "" : "s"}` : ""}</span>
          </form>
        )}

        {tab === "visitors" && (
          <>
            <div className={styles.toolbar}>
              <label className={styles.inline}>Period
                <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}>
                  <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
                </select>
              </label>
            </div>
            {visitors && (
              <dl className={styles.stats}>
                <div><dt>Anonymous visits</dt><dd>{visitors.summary.anonymousVisits}</dd></div>
                <div><dt>Unique visitors (accepted)</dt><dd>{visitors.summary.uniqueTrackedVisitors}</dd></div>
                <div><dt>Signed-in visits</dt><dd>{visitors.summary.signedInVisits}</dd></div>
              </dl>
            )}
            <p className={styles.note}>Anonymous visitors have no name or email. Only people who pressed Accept on the cookie banner are counted. A visitor code is a scrambled value from their browser cookie, so you can tell repeat visits apart.</p>
          </>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && !current && <p className={styles.empty}>Loading…</p>}

        {tab === "members" && members && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Member</th><th>Email</th><th>Signed up with</th><th>Joined</th><th>Last seen</th><th>Status</th><th className={styles.center}>Comments</th><th className={styles.center}>Votes</th><th className={styles.center}>Saved</th><th className={styles.center}>Posted deals</th></tr></thead>
              <tbody>
                {members.data.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Member"><strong>{m.name}</strong>{m.handle && <small>@{m.handle}</small>}</td>
                    <td data-label="Email">{m.email}{!m.emailVerified && <small className={styles.warn}>Not verified</small>}</td>
                    <td data-label="Signed up with">{m.signInMethods.join(", ") || "–"}</td>
                    <td data-label="Joined">{when(m.joinedAt)}</td>
                    <td data-label="Last seen">{when(m.lastSeenAt)}</td>
                    <td data-label="Status"><span className={`${styles.badge} ${m.status === "Active" ? styles.ok : styles.bad}`}>{m.status}</span></td>
                    <td data-label="Comments" className={styles.center}>{m.comments}</td><td data-label="Votes" className={styles.center}>{m.votes}</td><td data-label="Saved" className={styles.center}>{m.saved}</td><td data-label="Posted deals" className={styles.center}>{m.submissions}</td>
                  </tr>
                ))}
                {members.data.length === 0 && <tr><td colSpan={10} className={styles.empty}>{query ? "No member matches that search." : "No registered members yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "visitors" && visitors && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Visit started</th><th>Visitor</th><th>Source</th><th>Device</th><th>Landed on</th><th>Left on</th><th>Pages</th><th>Time active</th></tr></thead>
              <tbody>
                {visitors.data.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Visit started">{when(v.startedAt)}</td>
                    <td data-label="Visitor">{v.visitor ? <code>{v.visitor}</code> : "–"}{v.returning && <small>Returning</small>}</td>
                    <td data-label="Source">{v.source}</td>
                    <td data-label="Device">{v.device}<small>{v.browser} · {v.os}</small></td>
                    <td data-label="Landed on" className={styles.path}>{v.entry}</td>
                    <td data-label="Left on" className={styles.path}>{v.exit}</td>
                    <td data-label="Pages">{v.pages}</td>
                    <td data-label="Time active">{duration(v.seconds)}</td>
                  </tr>
                ))}
                {visitors.data.length === 0 && <tr><td colSpan={8} className={styles.empty}>No anonymous visits in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {current && current.totalPages > 1 && (
          <nav className={styles.pager} aria-label="Pages">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {current.page} of {current.totalPages}</span>
            <button type="button" disabled={page >= current.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
          </nav>
        )}
      </main>
    </>
  );
}
