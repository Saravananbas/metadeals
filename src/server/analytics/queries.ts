import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";

type Db = ReturnType<typeof getDatabase>;
export type DateRange = { from: Date; to: Date };

const IST_OFFSET_MIN = 330;
export const RAW_RETENTION_DAYS = 90;
const isMysql = () => (process.env.DATABASE_PROVIDER ?? (process.env.DATABASE_URL?.startsWith("mysql:") ? "mysql" : "postgresql")) === "mysql";

// Provider-neutral SQL fragments (MariaDB in production and locally, PostgreSQL for the CI schema).
const table = (name: string) => Prisma.raw(isMysql() ? `\`${name}\`` : `"${name}"`);
const col = (name: string, alias = "") => Prisma.raw(`${alias ? alias + "." : ""}${isMysql() ? `\`${name}\`` : `"${name}"`}`);
const istDay = (alias = "") => (isMysql() ? Prisma.sql`DATE(${col("createdAt", alias)} + INTERVAL ${IST_OFFSET_MIN} MINUTE)` : Prisma.sql`DATE(${col("createdAt", alias)} + INTERVAL '330 minutes')`);
const istHour = () => (isMysql() ? Prisma.sql`HOUR(${col("createdAt")} + INTERVAL ${IST_OFFSET_MIN} MINUTE)` : Prisma.sql`EXTRACT(HOUR FROM ${col("createdAt")} + INTERVAL '330 minutes')`);
const istDow = () => (isMysql() ? Prisma.sql`(DAYOFWEEK(${col("createdAt")} + INTERVAL ${IST_OFFSET_MIN} MINUTE) - 1)` : Prisma.sql`EXTRACT(DOW FROM ${col("createdAt")} + INTERVAL '330 minutes')`);

const num = (value: unknown) => Number(value ?? 0);
const dayKey = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/** Start of the Indian calendar day containing `date`, as a UTC instant. */
export function istStartOfDay(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MIN * 60_000);
}

export function resolveRange(preset: string, fromParam?: string | null, toParam?: string | null, now = new Date()): DateRange {
  const today = istStartOfDay(now);
  const day = 86_400_000;
  if (preset === "custom" && fromParam && toParam) {
    const from = istStartOfDay(new Date(fromParam)), to = new Date(istStartOfDay(new Date(toParam)).getTime() + day);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from) return { from, to: new Date(Math.min(to.getTime(), from.getTime() + 366 * day)) };
  }
  const days = preset === "today" ? 1 : preset === "30d" ? 30 : preset === "90d" ? 90 : 7;
  return { from: new Date(today.getTime() - (days - 1) * day), to: new Date(today.getTime() + day) };
}

const between = (range: DateRange) => ({ gte: range.from, lt: range.to });

async function overview(db: Db, range: DateRange) {
  const createdAt = between(range);
  const [types, visitorRows, dealViews, sessionAgg, bounced, returning, commission, uniqueRows] = await Promise.all([
    db.analyticsEvent.groupBy({ by: ["type"], where: { createdAt }, _count: { _all: true } }),
    db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'PAGE_VIEW' AND ${col("createdAt")} >= ${range.from} AND ${col("createdAt")} < ${range.to}`),
    db.analyticsEvent.count({ where: { createdAt, type: "PAGE_VIEW", pageType: "deal" } }),
    db.analyticsSession.aggregate({ where: { startedAt: createdAt }, _count: { _all: true }, _avg: { activeSeconds: true, pageCount: true } }),
    db.analyticsSession.count({ where: { startedAt: createdAt, pageCount: { lte: 1 } } }),
    db.analyticsSession.count({ where: { startedAt: createdAt, returning: true } }),
    db.affiliateTransaction.aggregate({ where: { reportedAt: createdAt, status: { in: ["APPROVED", "PAID"] } }, _sum: { commissionMinor: true }, _count: { _all: true } }),
    // People who accepted analytics, each counted once however many days they visit in the range.
    db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorKey")}) AS n FROM ${table("AnalyticsSession")} WHERE ${col("visitorKey")} IS NOT NULL AND ${col("startedAt")} >= ${range.from} AND ${col("startedAt")} < ${range.to}`),
  ]);
  const count = (type: string) => types.find((t) => t.type === type)?._count._all ?? 0;
  const sessions = sessionAgg._count._all;
  const buyClicks = count("BUY_CLICK");
  const commissionMinor = Number(commission._sum.commissionMinor ?? 0);
  return {
    views: count("PAGE_VIEW"),
    visitors: num(visitorRows[0]?.n),
    uniqueVisitors: num(uniqueRows[0]?.n),
    sessions,
    avgSessionSeconds: Math.round(sessionAgg._avg.activeSeconds ?? 0),
    pagesPerSession: Number((sessionAgg._avg.pageCount ?? 0).toFixed(2)),
    bounceRate: sessions ? Math.round((bounced / sessions) * 100) : 0,
    returningRate: sessions ? Math.round((returning / sessions) * 100) : 0,
    dealViews,
    buyClicks,
    ctr: dealViews ? Number(((buyClicks / dealViews) * 100).toFixed(1)) : 0,
    couponCopies: count("COUPON_COPY"),
    shares: count("SHARE"),
    likes: count("LIKE"),
    comments: count("COMMENT"),
    modalOpens: count("MODAL_OPEN"),
    searches: count("SEARCH"),
    transactions: commission._count._all,
    commissionMinor,
    earningsPerClickMinor: buyClicks ? Math.round(commissionMinor / buyClicks) : 0,
  };
}
export type Overview = Awaited<ReturnType<typeof overview>>;

async function series(db: Db, range: DateRange) {
  const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 86_400_000);
  const rawFrom = new Date(Math.max(range.from.getTime(), istStartOfDay(cutoff).getTime()));
  const byDay = new Map<string, { views: number; visitors: number; clicks: number }>();
  const row = (key: string) => byDay.get(key) ?? byDay.set(key, { views: 0, visitors: 0, clicks: 0 }).get(key)!;

  if (rawFrom < range.to) {
    const rows = await db.$queryRaw<{ d: unknown; views: unknown; visitors: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT ${istDay()} AS d,
             SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END) AS views,
             COUNT(DISTINCT CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN ${col("visitorHash")} END) AS visitors,
             SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END) AS clicks
      FROM ${table("AnalyticsEvent")} WHERE ${col("createdAt")} >= ${rawFrom} AND ${col("createdAt")} < ${range.to} GROUP BY d ORDER BY d`);
    for (const r of rows) Object.assign(row(dayKey(r.d)), { views: num(r.views), visitors: num(r.visitors), clicks: num(r.clicks) });
  }
  if (range.from < rawFrom) {
    const old = await db.analyticsDaily.findMany({ where: { dimension: "total", date: { gte: range.from, lt: rawFrom } } });
    for (const r of old) Object.assign(row(dayKey(r.date)), { views: r.views, visitors: r.visitors, clicks: r.clicks });
  }
  // Fill empty days so the chart has no gaps.
  const out: { date: string; views: number; visitors: number; clicks: number }[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86_400_000) {
    const key = new Date(t + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
    out.push({ date: key, ...(byDay.get(key) ?? { views: 0, visitors: 0, clicks: 0 }) });
  }
  return out;
}

async function topPages(db: Db, range: DateRange) {
  const rows = await db.$queryRaw<{ path: string; views: unknown; visitors: unknown }[]>(Prisma.sql`
    SELECT ${col("path")} AS path, COUNT(*) AS views, COUNT(DISTINCT ${col("visitorHash")}) AS visitors
    FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'PAGE_VIEW' AND ${col("createdAt")} >= ${range.from} AND ${col("createdAt")} < ${range.to}
    GROUP BY ${col("path")} ORDER BY views DESC LIMIT 15`);
  return rows.map((r) => ({ path: r.path, views: num(r.views), visitors: num(r.visitors), viewsPerVisitor: num(r.visitors) ? Number((num(r.views) / num(r.visitors)).toFixed(2)) : 0 }));
}

async function ranked(db: Db, range: DateRange, field: "dealId" | "merchantId" | "categoryId", limit = 15) {
  const view = Prisma.sql`SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END)`;
  const click = Prisma.sql`SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END)`;
  const rows = await db.$queryRaw<{ id: string; views: unknown; clicks: unknown }[]>(Prisma.sql`
    SELECT ${col(field)} AS id, ${view} AS views, ${click} AS clicks FROM ${table("AnalyticsEvent")}
    WHERE ${col(field)} IS NOT NULL AND ${col("type")} IN ('PAGE_VIEW', 'BUY_CLICK') AND ${col("createdAt")} >= ${range.from} AND ${col("createdAt")} < ${range.to}
    GROUP BY ${col(field)} ORDER BY (${view} + 3 * ${click}) DESC LIMIT ${limit}`);
  return rows.map((r) => {
    const views = num(r.views), clicks = num(r.clicks);
    return { id: r.id, views, clicks, ctr: views ? Number(((clicks / views) * 100).toFixed(1)) : 0 };
  });
}

async function withNames(db: Db, kind: "dealId" | "merchantId" | "categoryId", rows: { id: string; views: number; clicks: number; ctr: number }[]) {
  const ids = rows.map((r) => r.id);
  const names = new Map<string, string>();
  if (ids.length) {
    if (kind === "dealId") (await db.deal.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })).forEach((d) => names.set(d.id, d.title));
    if (kind === "merchantId") (await db.merchant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).forEach((m) => names.set(m.id, m.name));
    if (kind === "categoryId") (await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).forEach((c) => names.set(c.id, c.name));
  }
  return rows.map((r) => ({ ...r, name: names.get(r.id) ?? "(deleted)" }));
}

async function sources(db: Db, range: DateRange) {
  const createdAt = between(range);
  const [referrers, channels, devices, browsers, systems] = await Promise.all([
    db.analyticsEvent.groupBy({ by: ["referrerHost"], where: { createdAt, type: "PAGE_VIEW" }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    db.analyticsEvent.groupBy({ by: ["channel"], where: { createdAt, type: { in: ["PAGE_VIEW", "BUY_CLICK"] }, channel: { not: null } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    db.analyticsEvent.groupBy({ by: ["deviceType"], where: { createdAt, type: "PAGE_VIEW" }, _count: { _all: true }, orderBy: { _count: { id: "desc" } } }),
    db.analyticsSession.groupBy({ by: ["browser"], where: { startedAt: createdAt }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 6 }),
    db.analyticsSession.groupBy({ by: ["os"], where: { startedAt: createdAt }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 6 }),
  ]);
  return {
    referrers: referrers.map((r) => ({ name: r.referrerHost ?? "Direct / unknown", count: r._count._all })),
    channels: channels.map((r) => ({ name: r.channel ?? "web", count: r._count._all })),
    devices: devices.map((r) => ({ name: r.deviceType ?? "unknown", count: r._count._all })),
    browsers: browsers.map((r) => ({ name: r.browser, count: r._count._all })),
    systems: systems.map((r) => ({ name: r.os, count: r._count._all })),
  };
}

async function heatmap(db: Db, range: DateRange) {
  const rows = await db.$queryRaw<{ dow: unknown; hr: unknown; n: unknown }[]>(Prisma.sql`
    SELECT ${istDow()} AS dow, ${istHour()} AS hr, COUNT(*) AS n FROM ${table("AnalyticsEvent")}
    WHERE ${col("type")} = 'PAGE_VIEW' AND ${col("createdAt")} >= ${range.from} AND ${col("createdAt")} < ${range.to} GROUP BY dow, hr`);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) grid[num(r.dow)][num(r.hr)] = num(r.n);
  return grid;
}

async function funnel(db: Db, range: DateRange, current: Overview) {
  const base = Prisma.sql`${col("createdAt")} >= ${range.from} AND ${col("createdAt")} < ${range.to}`;
  const distinct = async (condition: Prisma.Sql) => {
    const rows = await db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${base} AND ${condition}`);
    return num(rows[0]?.n);
  };
  const [dealVisitors, clickVisitors] = await Promise.all([
    distinct(Prisma.sql`${col("type")} = 'PAGE_VIEW' AND ${col("pageType")} = 'deal'`),
    distinct(Prisma.sql`${col("type")} = 'BUY_CLICK'`),
  ]);
  return [
    { step: "Visitors", count: current.visitors },
    { step: "Viewed a deal", count: dealVisitors },
    { step: "Clicked Buy Now", count: clickVisitors },
    { step: "Commission recorded", count: current.transactions },
  ];
}

export async function getDashboard(range: DateRange) {
  const db = getDatabase();
  const length = range.to.getTime() - range.from.getTime();
  const previousRange = { from: new Date(range.from.getTime() - length), to: range.from };
  const [current, previous, daily, pages, deals, merchants, categories, src, heat] = await Promise.all([
    overview(db, range), overview(db, previousRange), series(db, range), topPages(db, range),
    ranked(db, range, "dealId"), ranked(db, range, "merchantId"), ranked(db, range, "categoryId"), sources(db, range), heatmap(db, range),
  ]);
  const [topDeals, topMerchants, topCategories, steps] = await Promise.all([
    withNames(db, "dealId", deals), withNames(db, "merchantId", merchants), withNames(db, "categoryId", categories), funnel(db, range, current),
  ]);
  return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, current, previous, series: daily, topPages: pages, topDeals, topMerchants, topCategories, sources: src, heatmap: heat, funnel: steps };
}

export async function getLive() {
  const db = getDatabase();
  const since = new Date(Date.now() - 5 * 60_000);
  const [visitors, sessions] = await Promise.all([
    db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'PAGE_VIEW' AND ${col("createdAt")} >= ${since}`),
    db.analyticsSession.findMany({ where: { lastSeenAt: { gte: since } }, orderBy: { lastSeenAt: "desc" }, take: 25 }),
  ]);
  const customers = await db.customer.findMany({ where: { id: { in: sessions.map((s) => s.customerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return {
    visitorsNow: num(visitors[0]?.n),
    sessions: sessions.map((s) => ({ id: s.id, page: s.exitPath, pages: s.pageCount, device: s.deviceType, activeSeconds: s.activeSeconds, customer: s.customerId ? names.get(s.customerId) ?? "Signed-in customer" : null, lastSeenAt: s.lastSeenAt.toISOString() })),
  };
}

export async function listSessions(page: number) {
  const db = getDatabase();
  const take = 25;
  const [rows, total] = await Promise.all([
    db.analyticsSession.findMany({ orderBy: { startedAt: "desc" }, skip: (page - 1) * take, take }),
    db.analyticsSession.count(),
  ]);
  const customers = await db.customer.findMany({ where: { id: { in: rows.map((s) => s.customerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return {
    total,
    page,
    items: rows.map((s) => ({
      id: s.id, startedAt: s.startedAt.toISOString(), activeSeconds: s.activeSeconds, pages: s.pageCount, entry: s.entryPath, exit: s.exitPath,
      source: s.referrerHost ?? s.utmSource ?? s.channel ?? "Direct", device: `${s.deviceType} · ${s.browser} · ${s.os}`, returning: s.returning,
      customer: s.customerId ? names.get(s.customerId) ?? "Signed-in customer" : null,
    })),
  };
}

export async function getSessionTimeline(id: string) {
  const db = getDatabase();
  const events = await db.analyticsEvent.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" }, take: 500 });
  const dealIds = [...new Set(events.map((e) => e.dealId).filter((x): x is string => Boolean(x)))];
  const deals = dealIds.length ? await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, title: true } }) : [];
  const titles = new Map(deals.map((d) => [d.id, d.title]));
  return events.map((e) => ({ at: e.createdAt.toISOString(), type: e.type, path: e.path, deal: e.dealId ? titles.get(e.dealId) ?? null : null, seconds: e.durationSec }));
}

/** Per-store report for vendor outreach (CSV). */
export async function vendorReport(range: DateRange) {
  const db = getDatabase();
  const rows = await withNames(db, "merchantId", await ranked(db, range, "merchantId", 1000));
  const header = "Store,Deal page views,Buy Now clicks,Click-through rate %";
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [header, ...rows.map((r) => [esc(r.name), r.views, r.clicks, r.ctr].join(","))].join("\n");
}
