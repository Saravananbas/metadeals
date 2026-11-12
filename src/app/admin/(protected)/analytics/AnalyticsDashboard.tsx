"use client";

import { Fragment, useEffect, useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./analytics-dashboard.module.css";

type Overview = {
  views: number; visitors: number; sessions: number; avgSessionSeconds: number; pagesPerSession: number; bounceRate: number; returningRate: number;
  dealViews: number; buyClicks: number; ctr: number; couponCopies: number; shares: number; likes: number; comments: number; modalOpens: number; searches: number;
  transactions: number; commissionMinor: number; earningsPerClickMinor: number;
};
type Ranked = { id: string; name: string; views: number; clicks: number; ctr: number };
type Named = { name: string; count: number };
type Dashboard = {
  range: { from: string; to: string };
  current: Overview; previous: Overview;
  series: { date: string; views: number; visitors: number; clicks: number }[];
  topPages: { path: string; views: number; visitors: number; viewsPerVisitor: number }[];
  topDeals: Ranked[]; topMerchants: Ranked[]; topCategories: Ranked[];
  sources: { referrers: Named[]; channels: Named[]; devices: Named[]; browsers: Named[]; systems: Named[] };
  heatmap: number[][];
  funnel: { step: string; count: number }[];
};
type Live = { visitorsNow: number; sessions: { id: string; page: string; pages: number; device: string; activeSeconds: number; customer: string | null; lastSeenAt: string }[] };
type SessionRow = { id: string; startedAt: string; activeSeconds: number; pages: number; entry: string; exit: string; source: string; device: string; returning: boolean; customer: string | null };
type TimelineRow = { at: string; type: string; path: string; deal: string | null; seconds: number };

const PRESETS = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => n.toLocaleString("en-IN");
const rupees = (minor: number) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;
const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Request failed");
  return body.data as T;
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (!before && !now) return <span className={`${styles.delta} ${styles.flat}`}>–</span>;
  if (!before) return <span className={`${styles.delta} ${styles.up}`}>new</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const good = invert ? pct < 0 : pct > 0;
  return <span className={`${styles.delta} ${pct === 0 ? styles.flat : good ? styles.up : styles.down}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}% vs previous</span>;
}

function Tile({ label, value, now, before, invert }: { label: string; value: string; now: number; before: number; invert?: boolean }) {
  return <div className={styles.tile}><small>{label}</small><strong>{value}</strong><Delta now={now} before={before} invert={invert} /></div>;
}

function Bars({ rows }: { rows: Named[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className={styles.muted}>No data yet.</p>;
  return <>{rows.map((r) => (
    <div className={styles.barRow} key={r.name}>
      <span className={styles.barLabel} title={r.name}>{r.name}</span>
      <div className={styles.barTrack}><div className={styles.bar} style={{ width: `${(r.count / max) * 100}%` }} /></div>
      <span className={styles.num}>{fmt(r.count)}</span>
    </div>
  ))}</>;
}

function TrendChart({ data }: { data: Dashboard["series"] }) {
  const w = 760, h = 200, pad = 28;
  const max = Math.max(1, ...data.flatMap((d) => [d.views, d.visitors, d.clicks]));
  const x = (i: number) => pad + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (w - pad * 2));
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = (key: "views" | "visitors" | "clicks") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  return (
    <>
      <div className={styles.legend}>
        <span><i className={styles.dot} style={{ background: "#5b21d6" }} />Page views</span>
        <span><i className={styles.dot} style={{ background: "#0ea5e9" }} />Visitors</span>
        <span><i className={styles.dot} style={{ background: "#f97316" }} />Buy Now clicks</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Daily page views, visitors and clicks">
        {[0, 0.5, 1].map((t) => <line key={t} x1={pad} x2={w - pad} y1={y(max * t)} y2={y(max * t)} stroke="#eee9fb" />)}
        <text x={4} y={y(max) + 4} fontSize="10" fill="#6b6b85">{fmt(max)}</text>
        <path d={line("views")} fill="none" stroke="#5b21d6" strokeWidth="2" />
        <path d={line("visitors")} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        <path d={line("clicks")} fill="none" stroke="#f97316" strokeWidth="2" />
        <text x={pad} y={h - 6} fontSize="10" fill="#6b6b85">{data[0]?.date}</text>
        <text x={w - pad} y={h - 6} fontSize="10" fill="#6b6b85" textAnchor="end">{data[data.length - 1]?.date}</text>
      </svg>
    </>
  );
}

function RankedTable({ title, rows }: { title: string; rows: Ranked[] }) {
  return (
    <div className={styles.card}>
      <h2>{title}</h2>
      <table className={styles.table}>
        <thead><tr><th>Name</th><th className={styles.num}>Views</th><th className={styles.num}>Buy clicks</th><th className={styles.num}>CTR</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}><td>{r.name}</td><td className={styles.num}>{fmt(r.views)}</td><td className={styles.num}>{fmt(r.clicks)}</td><td className={styles.num}>{r.ctr}%</td></tr>)}
          {!rows.length && <tr><td colSpan={4} className={styles.muted}>No data yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [preset, setPreset] = useState<string>("7d");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [sessions, setSessions] = useState<{ total: number; page: number; items: SessionRow[] } | null>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const [open, setOpen] = useState<{ id: string; rows: TimelineRow[] } | null>(null);
  const [error, setError] = useState("");

  const query = preset === "custom" ? `range=custom&from=${from}&to=${to}` : `range=${preset}`;

  useEffect(() => {
    if (preset === "custom" && (!from || !to)) return;
    let alive = true;
    getJson<Dashboard>(`/api/v1/admin/analytics/dashboard?${query}`)
      .then((d) => { if (alive) { setData(d); setError(""); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load analytics."); });
    return () => { alive = false; };
  }, [preset, from, to, query]);
  useEffect(() => {
    let alive = true;
    const tick = () => getJson<Live>("/api/v1/admin/analytics/live").then((l) => alive && setLive(l)).catch(() => {});
    void tick();
    const timer = window.setInterval(tick, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    getJson<{ total: number; page: number; items: SessionRow[] }>(`/api/v1/admin/analytics/sessions?page=${sessionPage}`).then(setSessions).catch(() => {});
  }, [sessionPage]);

  async function openSession(id: string) {
    if (open?.id === id) return setOpen(null);
    try { setOpen({ id, rows: await getJson<TimelineRow[]>(`/api/v1/admin/analytics/sessions/${id}`) }); } catch { setOpen(null); }
  }

  const c = data?.current, p = data?.previous;
  const heatMax = Math.max(1, ...(data?.heatmap.flat() ?? [1]));
  const funnelMax = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));

  return (
    <>
      <AdminNav active="analytics" />
      <main className={styles.page}>
        <div className={styles.head}>
          <h1>Analytics</h1>
          <div className={styles.controls}>
            {PRESETS.map(([key, label]) => <button key={key} className={`${styles.chip} ${preset === key ? styles.chipActive : ""}`} onClick={() => setPreset(key)}>{label}</button>)}
            <button className={`${styles.chip} ${preset === "custom" ? styles.chipActive : ""}`} onClick={() => setPreset("custom")}>Custom</button>
            {preset === "custom" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></>}
            <a className={styles.linkBtn} href={`/api/v1/admin/analytics/vendors?${query}`}>⬇ Store report (CSV)</a>
          </div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}

        <section className={styles.card} aria-label="Live visitors">
          <h2>Live now</h2>
          <div className={styles.live}>
            <span className={styles.liveNum}>{live?.visitorsNow ?? "–"}</span><span>visitors in the last 5 minutes</span>
            <span className={styles.muted}>{live?.sessions.length ?? 0} with a tracked session (accepted analytics)</span>
          </div>
          {!!live?.sessions.length && (
            <table className={styles.table}><tbody>
              {live.sessions.slice(0, 8).map((s) => <tr key={s.id}><td>{s.customer ?? "Anonymous"}</td><td>{s.page}</td><td>{s.pages} pages · {duration(s.activeSeconds)}</td><td>{s.device}</td></tr>)}
            </tbody></table>
          )}
        </section>

        {c && p && (
          <>
            <section className={styles.tiles} aria-label="Key numbers">
              <Tile label="Page views" value={fmt(c.views)} now={c.views} before={p.views} />
              <Tile label="Visitors (per day)" value={fmt(c.visitors)} now={c.visitors} before={p.visitors} />
              <Tile label="Sessions (accepted)" value={fmt(c.sessions)} now={c.sessions} before={p.sessions} />
              <Tile label="Avg time on site" value={duration(c.avgSessionSeconds)} now={c.avgSessionSeconds} before={p.avgSessionSeconds} />
              <Tile label="Pages per session" value={String(c.pagesPerSession)} now={c.pagesPerSession} before={p.pagesPerSession} />
              <Tile label="Bounce rate" value={`${c.bounceRate}%`} now={c.bounceRate} before={p.bounceRate} invert />
              <Tile label="Returning visitors" value={`${c.returningRate}%`} now={c.returningRate} before={p.returningRate} />
              <Tile label="Buy Now clicks" value={fmt(c.buyClicks)} now={c.buyClicks} before={p.buyClicks} />
              <Tile label="Click-through rate" value={`${c.ctr}%`} now={c.ctr} before={p.ctr} />
              <Tile label="Commission" value={rupees(c.commissionMinor)} now={c.commissionMinor} before={p.commissionMinor} />
              <Tile label="Earnings per click" value={rupees(c.earningsPerClickMinor)} now={c.earningsPerClickMinor} before={p.earningsPerClickMinor} />
              <Tile label="Coupon copies" value={fmt(c.couponCopies)} now={c.couponCopies} before={p.couponCopies} />
              <Tile label="Deal opens (popup)" value={fmt(c.modalOpens)} now={c.modalOpens} before={p.modalOpens} />
              <Tile label="Shares" value={fmt(c.shares)} now={c.shares} before={p.shares} />
              <Tile label="Likes" value={fmt(c.likes)} now={c.likes} before={p.likes} />
              <Tile label="Comment opens" value={fmt(c.comments)} now={c.comments} before={p.comments} />
            </section>
            <p className={styles.note}>Visitors are counted once per day without cookies. Sessions, time on site, bounce and returning figures come only from visitors who accepted analytics. Times are Indian Standard Time.</p>
          </>
        )}

        {data && (
          <>
            <section className={styles.card}><h2>Daily trend</h2><TrendChart data={data.series} /></section>

            <div className={styles.grid2}>
              <section className={styles.card}>
                <h2>Funnel</h2>
                {data.funnel.map((f, i) => (
                  <div className={styles.barRow} key={f.step} style={{ gridTemplateColumns: "150px 1fr 90px" }}>
                    <span>{f.step}</span>
                    <div className={styles.barTrack}><div className={styles.bar} style={{ width: `${(f.count / funnelMax) * 100}%` }} /></div>
                    <span className={styles.num}>{fmt(f.count)}{i > 0 && data.funnel[i - 1].count ? ` · ${Math.round((f.count / data.funnel[i - 1].count) * 100)}%` : ""}</span>
                  </div>
                ))}
              </section>
              <section className={styles.card}>
                <h2>Busiest hours (IST)</h2>
                <div className={styles.heat} aria-label="Page views by weekday and hour">
                  <span />{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ textAlign: "center" }}>{h % 6 === 0 ? h : ""}</span>)}
                  {data.heatmap.map((row, d) => (
                    <Fragment key={d}>
                      <span>{DAYS[d]}</span>
                      {row.map((n, h) => <span key={h} className={styles.heatCell} title={`${DAYS[d]} ${h}:00 · ${n} views`} style={{ background: `rgba(91,33,214,${n ? 0.12 + (n / heatMax) * 0.88 : 0.05})` }} />)}
                    </Fragment>
                  ))}
                </div>
              </section>
            </div>

            <section className={styles.card}>
              <h2>Pages opened most (and re-opened)</h2>
              <table className={styles.table}>
                <thead><tr><th>Page</th><th className={styles.num}>Views</th><th className={styles.num}>Visitors</th><th className={styles.num}>Views per visitor</th></tr></thead>
                <tbody>{data.topPages.map((r) => <tr key={r.path}><td>{r.path}</td><td className={styles.num}>{fmt(r.views)}</td><td className={styles.num}>{fmt(r.visitors)}</td><td className={styles.num}>{r.viewsPerVisitor}</td></tr>)}</tbody>
              </table>
            </section>

            <div className={styles.grid2}>
              <RankedTable title="Top deals" rows={data.topDeals} />
              <RankedTable title="Top stores (for vendor talks)" rows={data.topMerchants} />
              <RankedTable title="Top categories" rows={data.topCategories} />
              <section className={styles.card}><h2>Where visitors come from</h2><Bars rows={data.sources.referrers} /><h2 style={{ marginTop: 16 }}>Channels (Telegram, WhatsApp, …)</h2><Bars rows={data.sources.channels} /></section>
              <section className={styles.card}><h2>Devices</h2><Bars rows={data.sources.devices} /><h2 style={{ marginTop: 16 }}>Browsers</h2><Bars rows={data.sources.browsers} /><h2 style={{ marginTop: 16 }}>Operating systems</h2><Bars rows={data.sources.systems} /></section>
            </div>
          </>
        )}

        <section className={styles.card}>
          <h2>Visits (accepted analytics)</h2>
          <table className={styles.table}>
            <thead><tr><th>Started</th><th>Who</th><th>Source</th><th>Pages</th><th>Time</th><th>Device</th></tr></thead>
            <tbody>
              {sessions?.items.map((s) => (
                <Fragment key={s.id}>
                  <tr onClick={() => void openSession(s.id)} style={{ cursor: "pointer" }}>
                    <td>{new Date(s.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td>{s.customer ?? "Anonymous"}{s.returning ? " · returning" : ""}</td>
                    <td>{s.source}</td><td>{s.pages}</td><td>{duration(s.activeSeconds)}</td><td>{s.device}</td>
                  </tr>
                  {open?.id === s.id && (
                    <tr><td colSpan={6}><ol className={styles.timeline}>
                      {open.rows.map((r, i) => <li key={i}>{new Date(r.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} · {r.type.replace("_", " ").toLowerCase()} · {r.deal ?? r.path}{r.seconds ? ` · ${duration(r.seconds)}` : ""}</li>)}
                    </ol></td></tr>
                  )}
                </Fragment>
              ))}
              {sessions && !sessions.items.length && <tr><td colSpan={6} className={styles.muted}>No tracked visits yet. They appear when visitors accept analytics.</td></tr>}
            </tbody>
          </table>
          {sessions && sessions.total > 25 && (
            <div className={styles.pager}>
              <button disabled={sessionPage <= 1} onClick={() => setSessionPage((v) => v - 1)}>Previous</button>
              <span>Page {sessionPage} of {Math.ceil(sessions.total / 25)}</span>
              <button disabled={sessionPage >= Math.ceil(sessions.total / 25)} onClick={() => setSessionPage((v) => v + 1)}>Next</button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
