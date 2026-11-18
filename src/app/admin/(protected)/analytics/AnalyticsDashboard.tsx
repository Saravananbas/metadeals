"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, BarChart3, CalendarDays, Clock, Download, Eye, Heart, Home, IndianRupee, Layers, Radio, Share2, Tag, Users, UserCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ChartState, Donut, Funnel, HBars, Heat, TimeChart, fmt } from "./charts";
import styles from "./analytics-dashboard.module.css";

const TABS = [["overview", "Overview", Home], ["audience", "Audience", Users], ["deals", "Deals", Tag], ["engagement", "Engagement", Heart], ["revenue", "Revenue", IndianRupee], ["sources", "Traffic Sources", Share2]] as const;
type TabKey = (typeof TABS)[number][0];
const PRESETS = [["today", "Today"], ["7d", "7 Days"], ["30d", "30 Days"], ["90d", "90 Days"]] as const;
const rupees = (minor: number | null) => (minor === null ? "n/a" : `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const duration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = any;
type Live = { visitorsNow: number; sessions: { id: string; page: string; pages: number; device: string; activeSeconds: number; customer: string | null }[] };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "Could not load this report.");
  return body.data as T;
}

function Card({ title, children, action, className = "" }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{(title || action) && <header className={styles.cardHead}><h2>{title}</h2>{action}</header>}{children}</section>;
}

/** Comparison with the previous equal-length period. Shown only when that period has data; never invented. */
function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className={`${styles.delta} ${styles.flat}`} title="No data in the previous period to compare with">no earlier data</span>;
  const p = Math.round(((now - before) / before) * 100), good = invert ? p < 0 : p > 0;
  return <span className={`${styles.delta} ${p === 0 ? styles.flat : good ? styles.up : styles.down}`}>{p > 0 ? "▲" : p < 0 ? "▼" : "•"} {p > 0 ? "+" : ""}{p}%</span>;
}

function Kpi({ icon, label, value, now, before, invert, tone = "" }: { icon: ReactNode; label: string; value: string; now?: number; before?: number; invert?: boolean; tone?: string }) {
  return (
    <div className={styles.kpi}>
      <span className={`${styles.kpiIcon} ${tone ? styles[tone] : ""}`}>{icon}</span>
      <div><strong>{value}</strong><small>{label}</small>{now !== undefined && before !== undefined && <Delta now={now} before={before} invert={invert} />}</div>
    </div>
  );
}

function Table({ head, rows, empty = "No data for this period yet." }: { head: { label: string; num?: boolean }[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{head.map((h) => <th key={h.label} className={h.num ? styles.num : ""}>{h.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={head[j]?.num ? styles.num : ""}>{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className={styles.muted}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Note = ({ text }: { text?: string | null }) => (text ? <p className={styles.note}>{text}</p> : null);
// eslint-disable-next-line @next/next/no-img-element -- small admin thumbnails from the media endpoint, already resized
const Thumb = ({ src }: { src: string | null }) => (src ? <img className={styles.thumb} src={src} alt="" loading="lazy" /> : <span className={styles.thumb} />);

function Overview({ d, go }: { d: D; go: (t: TabKey) => void }) {
  const c = d.current, p = d.previous;
  return (
    <div className={styles.overview}>
      <div className={styles.kpis}>
        <Kpi icon={<Eye size={20} />} label="Page views" value={fmt(c.views)} now={c.views} before={p.views} />
        <Kpi icon={<Users size={20} />} label="Visitors (per day)" value={fmt(c.visitors)} now={c.visitors} before={p.visitors} tone="blue" />
        <Kpi icon={<UserCheck size={20} />} label="Unique visitors (accepted)" value={fmt(c.uniqueVisitors)} now={c.uniqueVisitors} before={p.uniqueVisitors} tone="green" />
        <Kpi icon={<Activity size={20} />} label="Accepted sessions" value={fmt(c.sessions)} now={c.sessions} before={p.sessions} tone="amber" />
        <Kpi icon={<Clock size={20} />} label="Avg. time on site" value={duration(c.avgSessionSeconds)} now={c.avgSessionSeconds} before={p.avgSessionSeconds} />
        <Kpi icon={<Layers size={20} />} label="Pages / session" value={String(c.pagesPerSession)} now={c.pagesPerSession} before={p.pagesPerSession} tone="red" />
      </div>
      <div className={styles.row3a}>
        <Card title="Traffic trend"><TimeChart data={d.series} height={100} series={[{ key: "views", label: "Page views" }, { key: "visitors", label: "Visitors" }, { key: "clicks", label: "Buy Now clicks" }]} /></Card>
        <Card title="Page views by device"><ChartState empty={!d.sources.devices.length} height={150}><Donut rows={d.sources.devices} centre="Page views" /></ChartState></Card>
        <Card title="Traffic sources"><ChartState empty={!d.sourceClasses.some((s: D) => s.count)} height={150}><Donut rows={d.sourceClasses.filter((s: D) => s.count)} centre="Page views" /></ChartState></Card>
      </div>
      <div className={styles.row3b}>
        <Card title="Funnel overview"><Funnel steps={d.funnel} /><Note text={d.commissionNote} /></Card>
        <Card title="Busiest hours (IST)"><Heat grid={d.heatmap} unit="page views" compact /></Card>
        <Card title="Top categories" action={<button className={styles.viewAll} onClick={() => go("deals")}>View all →</button>}>
          <ChartState empty={!d.topCategories.length} height={120}><HBars rows={d.topCategories.slice(0, 3).map((x: D) => ({ name: x.name, count: x.views, note: `${x.clicks} clicks · ${x.ctr}%` }))} /></ChartState>
        </Card>
      </div>
      <div className={styles.row3c}>
        <Card title="Top deals" action={<button className={styles.viewAll} onClick={() => go("deals")}>View all →</button>}>
          <Table head={[{ label: "Deal" }, { label: "Views", num: true }, { label: "Clicks", num: true }, { label: "CTR", num: true }]} rows={d.topDeals.slice(0, 3).map((x: D) => [<span className={styles.dealCell} key="d"><Thumb src={x.image} /><span title={x.name}>{x.name}</span></span>, fmt(x.views), fmt(x.clicks), `${x.ctr}%`])} />
        </Card>
        <Card title="Engagement summary" action={<button className={styles.viewAll} onClick={() => go("engagement")}>View all →</button>}>
          <div className={styles.engGrid}>
            <Kpi icon={<Heart size={18} />} label="Likes / helpful votes" value={fmt(c.likes)} now={c.likes} before={p.likes} tone="red" />
            <Kpi icon={<Share2 size={18} />} label="Shares" value={fmt(c.shares)} now={c.shares} before={p.shares} tone="blue" />
            <Kpi icon={<Eye size={18} />} label="Comment opens" value={fmt(c.comments)} now={c.comments} before={p.comments} />
            <Kpi icon={<Tag size={18} />} label="Coupon copies" value={fmt(c.couponCopies)} now={c.couponCopies} before={p.couponCopies} tone="amber" />
          </div>
        </Card>
        <Card title="Recent visits" action={<button className={styles.viewAll} onClick={() => go("audience")}>View all →</button>}>
          <Table head={[{ label: "Started" }, { label: "Visitor" }, { label: "Source" }, { label: "Pages", num: true }, { label: "Time", num: true }]} rows={d.visits.slice(0, 3).map((v: D) => [when(v.startedAt), v.visitor, v.source, v.pages, duration(v.seconds)])} empty="No accepted visits yet." />
        </Card>
      </div>
    </div>
  );
}

function Visits({ initial, query }: { initial: D; query: string }) {
  const [page, setPage] = useState(1);
  const [fetched, setFetched] = useState<D>(null);
  const [open, setOpen] = useState<{ id: string; rows: D[] } | null>(null);
  const data = page === 1 || !fetched ? initial : fetched;
  useEffect(() => {
    if (page === 1) return;
    let alive = true;
    getJson<D>(`/api/v1/admin/analytics/tab/audience?${query}&page=${page}`).then((r) => alive && setFetched(r.visits)).catch(() => {});
    return () => { alive = false; };
  }, [page, query]);
  async function toggle(id: string) {
    if (open?.id === id) return setOpen(null);
    try { setOpen({ id, rows: await getJson<D[]>(`/api/v1/admin/analytics/sessions/${id}`) }); } catch { setOpen(null); }
  }
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <Card title="Recent visits (accepted analytics)">
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Started (IST)</th><th>Visitor</th><th>Source</th><th className={styles.num}>Pages</th><th className={styles.num}>Duration</th><th>Device</th></tr></thead>
          <tbody>
            {data.items.map((v: D) => (
              <Fragment key={v.id}>
                <tr onClick={() => void toggle(v.id)} className={styles.clickRow}><td>{when(v.startedAt)}</td><td>{v.visitor}{v.returning ? " · returning" : ""}</td><td>{v.source}</td><td className={styles.num}>{v.pages}</td><td className={styles.num}>{duration(v.seconds)}</td><td>{v.device} · {v.browser}</td></tr>
                {open && open.id === v.id && <tr><td colSpan={6}><ol className={styles.timeline}>{open.rows.map((r, i) => <li key={i}>{new Date(r.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} · {String(r.type).replace("_", " ").toLowerCase()} · {r.deal ?? r.path}{r.seconds ? ` · ${duration(r.seconds)}` : ""}</li>)}</ol></td></tr>}
              </Fragment>
            ))}
            {!data.items.length && <tr><td colSpan={6} className={styles.muted}>No accepted visits in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      {data.total > data.pageSize && <div className={styles.pager}><button disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage((v) => v + 1)}>Next</button></div>}
    </Card>
  );
}

function Audience({ d, query }: { d: D; query: string }) {
  const c = d.current, p = d.previous;
  return (
    <div className={styles.stack}>
      <div className={styles.kpis4}>
        <Kpi icon={<Eye size={20} />} label="Total visitors (per day)" value={fmt(c.visitors)} now={c.visitors} before={p.visitors} />
        <Kpi icon={<UserCheck size={20} />} label="Unique visitors (accepted)" value={fmt(c.uniqueVisitors)} now={c.uniqueVisitors} before={p.uniqueVisitors} tone="green" />
        <Kpi icon={<Users size={20} />} label="Returning visitors" value={fmt(d.returningVisitors)} tone="blue" />
        <Kpi icon={<Users size={20} />} label="New visitors" value={fmt(d.newVisitors)} tone="amber" />
        <Kpi icon={<Activity size={20} />} label="Accepted sessions" value={fmt(c.sessions)} now={c.sessions} before={p.sessions} />
        <Kpi icon={<Clock size={20} />} label="Avg. session duration" value={duration(c.avgSessionSeconds)} now={c.avgSessionSeconds} before={p.avgSessionSeconds} tone="blue" />
        <Kpi icon={<Layers size={20} />} label="Pages / session" value={String(c.pagesPerSession)} now={c.pagesPerSession} before={p.pagesPerSession} tone="red" />
        <Kpi icon={<BarChart3 size={20} />} label="Bounce rate (1 page)" value={`${c.bounceRate}%`} now={c.bounceRate} before={p.bounceRate} invert tone="amber" />
      </div>
      <div className={styles.grid3}>
        <Card title="New vs returning visitors"><ChartState empty={!d.newVisitors && !d.returningVisitors} height={140}><Donut rows={[{ name: "New", count: d.newVisitors }, { name: "Returning", count: d.returningVisitors }]} centre="Visitors" /></ChartState></Card>
        <Card title="Device distribution (page views)"><ChartState empty={!d.devices.length} height={140}><Donut rows={d.devices} centre="Page views" /></ChartState></Card>
        <Card title="Visitors over time"><TimeChart data={d.series} height={150} series={[{ key: "visitors", label: "Visitors" }]} /></Card>
      </div>
      <div className={styles.grid3}>
        <Card title="Browsers (accepted sessions)"><ChartState empty={!d.browsers.length} height={120}><HBars rows={d.browsers} /></ChartState></Card>
        <Card title="Operating systems (accepted sessions)"><ChartState empty={!d.systems.length} height={120}><HBars rows={d.systems} /></ChartState></Card>
        <Card title="Visitor activity by hour (IST)"><Heat grid={d.heatmap} unit="page views" compact /></Card>
      </div>
      <Card title="Landing pages"><Table head={[{ label: "Page" }, { label: "Sessions", num: true }, { label: "Avg. pages", num: true }, { label: "Avg. time", num: true }]} rows={d.landing.map((l: D) => [l.path, fmt(l.sessions), l.avgPages, duration(l.avgSeconds)])} /></Card>
      <Visits key={query} initial={d.visits} query={query} />
      <Note text={d.note} />
    </div>
  );
}

function Deals({ d, filters, setFilters }: { d: D; filters: Record<string, string>; setFilters: (f: Record<string, string>) => void }) {
  const k = d.kpis;
  const sel = (key: string, label: string, options: { value: string; label: string }[]) => (
    <label className={styles.filter}>{label}<select value={filters[key] ?? ""} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}><option value="">All</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        {sel("merchantId", "Store", d.options.merchants.map((m: D) => ({ value: m.id, label: m.name })))}
        {sel("categoryId", "Category", d.options.categories.map((m: D) => ({ value: m.id, label: m.name })))}
        {sel("status", "Deal status", d.options.statuses.map((s: string) => ({ value: s, label: s.replace("_", " ").toLowerCase() })))}
      </div>
      <div className={styles.kpis4}>
        <Kpi icon={<Eye size={20} />} label="Deal page views" value={fmt(k.views)} />
        <Kpi icon={<Users size={20} />} label="Unique deal visitors (per day)" value={fmt(k.uniqueVisitors)} tone="blue" />
        <Kpi icon={<Tag size={20} />} label="Buy Now clicks" value={fmt(k.clicks)} tone="green" />
        <Kpi icon={<BarChart3 size={20} />} label="Click-through rate" value={`${k.ctr}%`} tone="amber" />
        <Kpi icon={<Tag size={20} />} label="Coupon copies" value={fmt(k.coupons)} tone="red" />
        <Kpi icon={<Activity size={20} />} label="Top deal" value={k.top ?? "–"} />
      </div>
      <div className={styles.grid2}>
        <Card title="Deal views per day"><TimeChart kind="column" data={d.series} height={160} series={[{ key: "views", label: "Deal views" }]} /></Card>
        <Card title="Buy Now clicks per day"><TimeChart kind="column" data={d.series} height={160} series={[{ key: "clicks", label: "Buy Now clicks", color: "var(--md-green-600)" }]} /></Card>
      </div>
      <div className={styles.grid2}>
        <Card title="Performance by category (views)"><ChartState empty={!d.categories.length} height={120}><HBars rows={d.categories.map((x: D) => ({ name: x.name, count: x.views, note: `${x.clicks} clicks · ${x.ctr}%` }))} /></ChartState></Card>
        <Card title="Deal conversion funnel"><Funnel steps={d.funnel} /></Card>
      </div>
      <Card title="Deal performance">
        <Table head={[{ label: "Deal" }, { label: "Store" }, { label: "Category" }, { label: "Views", num: true }, { label: "Visitors", num: true }, { label: "Clicks", num: true }, { label: "CTR", num: true }, { label: "Coupons", num: true }]}
          rows={d.deals.map((x: D) => [<span className={styles.dealCell} key="d"><Thumb src={x.image} />{x.slug ? <a href={`/deal/${x.slug}`} target="_blank" rel="noreferrer" title={x.title}>{x.title}</a> : x.title}</span>, x.merchant, x.category, fmt(x.views), fmt(x.visitors), fmt(x.clicks), `${x.ctr}%`, fmt(x.coupons)])} />
      </Card>
      <Note text={d.note} />
    </div>
  );
}

function Engagement({ d }: { d: D }) {
  const k = d.kpis;
  return (
    <div className={styles.stack}>
      <div className={styles.kpis4}>
        <Kpi icon={<Heart size={20} />} label="Helpful votes / likes" value={fmt(k.likes)} tone="red" />
        <Kpi icon={<Share2 size={20} />} label="Shares" value={fmt(k.shares)} tone="blue" />
        <Kpi icon={<Eye size={20} />} label="Comment opens" value={fmt(k.commentOpens)} />
        <Kpi icon={<Tag size={20} />} label="Coupon copies" value={fmt(k.coupons)} tone="amber" />
        <Kpi icon={<Layers size={20} />} label="Deal popup opens" value={fmt(k.modalOpens)} tone="green" />
        <Kpi icon={<Users size={20} />} label="Discussions created" value={fmt(k.discussionsCreated)} />
        <Kpi icon={<Activity size={20} />} label="Comments posted" value={fmt(k.commentsPosted)} tone="blue" />
        <Kpi icon={<Eye size={20} />} label="Community page views" value={fmt(k.communityViews)} tone="amber" />
      </div>
      <div className={styles.grid2}>
        <Card title="Engagement events over time"><TimeChart data={d.series} height={170} series={[{ key: "LIKE", label: "Likes" }, { key: "SHARE", label: "Shares" }, { key: "COMMENT", label: "Comment opens" }, { key: "COUPON_COPY", label: "Coupon copies" }, { key: "MODAL_OPEN", label: "Popup opens" }]} /></Card>
        <Card title="Engagement distribution"><ChartState empty={!d.distribution.some((x: D) => x.count)} height={150}><Donut rows={d.distribution.filter((x: D) => x.count)} centre="Events" /></ChartState></Card>
      </div>
      <div className={styles.grid2}>
        <Card title="Most engaged deals"><ChartState empty={!d.deals.length} height={120}><HBars rows={d.deals.slice(0, 8).map((x: D) => ({ name: x.title, count: x.total }))} /></ChartState></Card>
        <Card title="Most viewed discussions (all-time)"><ChartState empty={!d.discussions.length} height={120}><HBars rows={d.discussions.slice(0, 8).map((x: D) => ({ name: x.title, count: x.views }))} /></ChartState></Card>
      </div>
      <Card title="Engagement by day and hour (IST)"><Heat grid={d.heatmap} unit="engagement events" /></Card>
      <Card title="Engagement by deal"><Table head={[{ label: "Deal" }, { label: "Store" }, { label: "Likes", num: true }, { label: "Shares", num: true }, { label: "Comment opens", num: true }, { label: "Coupons", num: true }, { label: "Popups", num: true }]} rows={d.deals.map((x: D) => [x.title, x.merchant, x.likes, x.shares, x.comments, x.coupons, x.opens])} /></Card>
      <Card title="Top discussions (all-time counters)"><Table head={[{ label: "Discussion" }, { label: "Views", num: true }, { label: "Comments", num: true }, { label: "Likes", num: true }]} rows={d.discussions.map((x: D) => [x.title, fmt(x.views), fmt(x.comments), fmt(x.likes)])} /></Card>
      <Note text={d.note} />
    </div>
  );
}

function Revenue({ d }: { d: D }) {
  const k = d.kpis;
  return (
    <div className={styles.stack}>
      <div className={styles.kpis4}>
        <Kpi icon={<Share2 size={20} />} label="Affiliate outbound clicks" value={fmt(k.clicks)} />
        <Kpi icon={<Layers size={20} />} label="Reported orders" value={fmt(k.orders)} tone="blue" />
        <Kpi icon={<Clock size={20} />} label="Pending commission" value={rupees(k.pendingMinor)} tone="amber" />
        <Kpi icon={<IndianRupee size={20} />} label="Approved commission" value={rupees(k.approvedMinor)} tone="green" />
        <Kpi icon={<Activity size={20} />} label="Rejected / cancelled orders" value={fmt(k.rejectedOrders)} tone="red" />
        <Kpi icon={<IndianRupee size={20} />} label="Rejected commission" value={rupees(k.rejectedMinor)} tone="red" />
        <Kpi icon={<BarChart3 size={20} />} label="Earnings per click (approved)" value={rupees(k.earningsPerClickMinor)} tone="green" />
      </div>
      <div className={styles.grid2}>
        <Card title="Affiliate clicks over time"><TimeChart data={d.clicksSeries} height={160} series={[{ key: "clicks", label: "Outbound clicks" }]} /></Card>
        <Card title="Commission over time (₹)"><TimeChart kind="column" stacked data={d.commissionSeries.map((r: D) => ({ date: r.date, approved: Math.round(r.approved / 100), pending: Math.round(r.pending / 100), rejected: Math.round(r.rejected / 100) }))} height={160} series={[{ key: "approved", label: "Approved ₹", color: "var(--md-green-600)" }, { key: "pending", label: "Pending ₹", color: "var(--md-amber-600)" }, { key: "rejected", label: "Rejected ₹", color: "var(--md-red-600)" }]} /></Card>
      </div>
      <div className={styles.grid3}>
        <Card title="Commission by store (approved ₹)"><ChartState empty={!d.merchants.some((m: D) => m.approvedMinor)} height={120}><HBars rows={d.merchants.filter((m: D) => m.approvedMinor).slice(0, 8).map((m: D) => ({ name: m.name, count: Math.round(m.approvedMinor / 100) }))} valueLabel={(n) => `₹${fmt(n)}`} /></ChartState></Card>
        <Card title="Commission status (orders)"><ChartState empty={!d.status.some((s: D) => s.count)} height={140}><Donut rows={d.status.map((s: D) => ({ name: s.name, count: s.count }))} centre="Orders" /></ChartState></Card>
        <Card title="Affiliate funnel"><Funnel steps={d.funnel} /></Card>
      </div>
      <Card title="Revenue by store">
        <Table head={[{ label: "Store" }, { label: "Clicks", num: true }, { label: "Orders", num: true }, { label: "Order value", num: true }, { label: "Pending", num: true }, { label: "Approved", num: true }, { label: "Rejected", num: true }, { label: "Earnings / click", num: true }]}
          rows={d.merchants.map((m: D) => [m.name, fmt(m.clicks), fmt(m.orders), "n/a", rupees(m.pendingMinor), rupees(m.approvedMinor), rupees(m.rejectedMinor), rupees(m.earningsPerClickMinor)])} />
      </Card>
      <Note text={d.note} />
    </div>
  );
}

function Sources({ d }: { d: D }) {
  const k = d.kpis;
  return (
    <div className={styles.stack}>
      <div className={styles.kpis4}>
        <Kpi icon={<Users size={20} />} label="Total visitors (per day)" value={fmt(k.visitors)} />
        <Kpi icon={<Eye size={20} />} label="Direct / unknown (views)" value={fmt(k.direct)} tone="blue" />
        <Kpi icon={<BarChart3 size={20} />} label="Search (views)" value={fmt(k.search)} tone="green" />
        <Kpi icon={<Share2 size={20} />} label="Social incl. Telegram, WhatsApp" value={fmt(k.social)} tone="amber" />
        <Kpi icon={<Layers size={20} />} label="Other referral (views)" value={fmt(k.referral)} tone="red" />
        <Kpi icon={<Tag size={20} />} label="Campaign sessions" value={fmt(k.campaignSessions)} />
      </div>
      <div className={styles.grid2}>
        <Card title="Traffic sources (page views)"><ChartState empty={!d.classes.some((s: D) => s.count)} height={150}><Donut rows={d.classes.filter((s: D) => s.count)} centre="Page views" /></ChartState></Card>
        <Card title="Traffic sources over time"><TimeChart kind="column" stacked data={d.daily} height={160} series={d.classes.map((s: D) => ({ key: s.name, label: s.name }))} /></Card>
      </div>
      <div className={styles.grid3}>
        <Card title="Top referrers"><ChartState empty={!d.referrers.length} height={120}><HBars rows={d.referrers} /></ChartState></Card>
        <Card title="Channel performance (views / clicks)"><ChartState empty={!d.channels.length} height={120}><HBars rows={d.channels.map((c: D) => ({ name: c.name, count: c.views, note: `${c.clicks} clicks · ${c.ctr}%` }))} /></ChartState></Card>
        <Card title="Landing pages from outside"><ChartState empty={!d.landing.length} height={120}><HBars rows={d.landing.map((c: D) => ({ name: c.path, count: c.views, note: `${c.clicks} clicks` }))} /></ChartState></Card>
      </div>
      <Card title="Source, medium and campaign (accepted sessions)">
        <Table head={[{ label: "Source" }, { label: "Medium" }, { label: "Campaign" }, { label: "Visitors", num: true }, { label: "Sessions", num: true }, { label: "Page views", num: true }, { label: "Buy Now clicks", num: true }, { label: "Clicks / session", num: true }]} rows={d.table.map((r: D) => [r.source, r.medium, r.campaign || "–", fmt(r.visitors), fmt(r.sessions), fmt(r.pages), fmt(r.clicks), r.clicksPerSession])} />
      </Card>
      <Note text={d.note} />
    </div>
  );
}

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [preset, setPreset] = useState("7d");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<D>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<Live | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cache = useRef(new Map<string, D>());

  const range = preset === "custom" ? `range=custom&from=${from}&to=${to}` : `range=${preset}`;
  const extra = tab === "deals" ? Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("") : "";
  const query = range + extra;
  const key = `${tab}|${query}|${nonce}`;
  const customReady = preset !== "custom" || (from && to && from <= to);

  useEffect(() => {
    if (!customReady) return;
    const hit = cache.current.get(key);
    if (hit && Date.now() - hit.at < 60_000) { setData(hit.data); setError(""); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    getJson<D>(`/api/v1/admin/analytics/tab/${tab}?${query}`, ctl.signal)
      .then((r) => { cache.current.set(key, { at: Date.now(), data: r }); setData(r); setError(""); })
      .catch((e) => { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "Could not load analytics."); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [key, tab, query, customReady]);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (!document.hidden) getJson<Live>("/api/v1/admin/analytics/live").then((l) => alive && setLive(l)).catch(() => {}); };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const go = useCallback((t: TabKey) => { setTab(t); setData(null); }, []);
  const ready = data && !loading;

  return (
    <>
      <AdminNav active="analytics" />
      <main className={styles.page}>
        <div className={styles.head}>
          <div><h1>Analytics Dashboard</h1><p>Comprehensive insights into traffic, engagement, deals and revenue.</p></div>
          <div className={styles.controls}>
            <div className={styles.range} role="group" aria-label="Date range">
              <CalendarDays size={16} aria-hidden />
              {PRESETS.map(([k, label]) => <button key={k} className={`${styles.chip} ${preset === k ? styles.chipActive : ""}`} onClick={() => setPreset(k)}>{label}</button>)}
              <button className={`${styles.chip} ${preset === "custom" ? styles.chipActive : ""}`} onClick={() => setPreset("custom")}>Custom</button>
            </div>
            {preset === "custom" && <span className={styles.dates}><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></span>}
            <div className={styles.liveWrap}>
              <button className={styles.live} onClick={() => setLiveOpen((v) => !v)} aria-expanded={liveOpen}><Radio size={15} /> Live now: <b>{live?.visitorsNow ?? "–"}</b></button>
              {liveOpen && (
                <div className={styles.livePanel} role="dialog" aria-label="Live visitors">
                  <p><b>{live?.visitorsNow ?? 0}</b> visitors in the last 5 minutes · {live?.sessions.length ?? 0} accepted sessions</p>
                  {live?.sessions.slice(0, 8).map((s) => <div key={s.id} className={styles.liveRow}><span>{s.page}</span><span>{s.device} · {s.pages} pages</span></div>)}
                  {!live?.sessions.length && <p className={styles.muted}>No accepted active sessions right now.</p>}
                </div>
              )}
            </div>
            <a className={styles.export} href={customReady ? `/api/v1/admin/analytics/export/${tab}?${query}` : undefined} aria-disabled={!customReady}><Download size={16} /> Export Report (CSV)</a>
          </div>
        </div>
        <nav className={styles.tabs} aria-label="Analytics sections" role="tablist">
          {TABS.map(([k, label, Icon]) => <button key={k} role="tab" aria-selected={tab === k} className={`${styles.tab} ${tab === k ? styles.tabActive : ""}`} onClick={() => go(k)}><Icon size={16} aria-hidden />{label}</button>)}
        </nav>
        {error && <div className={styles.error} role="alert">{error} <button onClick={() => { cache.current.clear(); setError(""); setNonce((n) => n + 1); }}>Retry</button></div>}
        {!customReady && <p className={styles.note}>Choose a from and to date (the end date cannot be before the start).</p>}
        {!ready && !error && customReady && <div className={styles.skelGrid} aria-busy="true"><div className={styles.skeleton} style={{ height: 84 }} /><div className={styles.skeleton} style={{ height: 230 }} /><div className={styles.skeleton} style={{ height: 230 }} /></div>}
        {ready && tab === "overview" && <Overview d={data} go={go} />}
        {ready && tab === "audience" && <Audience d={data} query={query} />}
        {ready && tab === "deals" && <Deals d={data} filters={filters} setFilters={setFilters} />}
        {ready && tab === "engagement" && <Engagement d={data} />}
        {ready && tab === "revenue" && <Revenue d={data} />}
        {ready && tab === "sources" && <Sources d={data} />}
        <p className={styles.note}>Times are Indian Standard Time. Visitors are counted once per day without cookies; sessions, time on site and unique visitors cover only people who accepted analytics. Definitions: docs/ANALYTICS_DEFINITIONS.md.</p>
      </main>
    </>
  );
}
