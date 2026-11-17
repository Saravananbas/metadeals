import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { RAW_RETENTION_DAYS, between, col, dayKey, getDashboard, heatmap, istDay, istDow, istHour, istStartOfDay, num, series, table, type DateRange } from "./queries";

/**
 * Per-tab analytics. Everything is computed on the server from the existing AnalyticsEvent / AnalyticsSession / AffiliateClick /
 * AffiliateTransaction rows; nothing is written and no new tracking exists. Definitions: docs/ANALYTICS_DEFINITIONS.md.
 */
type Db = ReturnType<typeof getDatabase>;
export const TABS = ["overview", "audience", "deals", "engagement", "revenue", "sources"] as const;
export type Tab = (typeof TABS)[number];
export type DealFilters = { merchantId?: string; categoryId?: string; status?: string };
const DEAL_STATUSES = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "EXPIRED", "ARCHIVED"];
const IST = 330 * 60_000;
const DAY = 86_400_000;
const inRange = (range: DateRange, alias = "") => Prisma.sql`${col("createdAt", alias)} >= ${range.from} AND ${col("createdAt", alias)} < ${range.to}`;
const pct = (a: number, b: number) => (b ? Number(((a / b) * 100).toFixed(1)) : 0);
const istKey = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const dayKeys = (range: DateRange) => { const out: string[] = []; for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY) out.push(istKey(new Date(t))); return out; };
/** Raw events are kept 90 days; older days in a longer range have totals only on the Overview. */
const rawNote = (range: DateRange) => (range.from.getTime() < istStartOfDay(new Date(Date.now() - RAW_RETENTION_DAYS * DAY)).getTime() ? `Detailed events are kept ${RAW_RETENTION_DAYS} days, so days before that show no detail on this tab.` : null);
const firstName = (name: string | null | undefined) => (name ? name.trim().split(/\s+/)[0] : null);

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave)\./i;
const SOCIAL = /(facebook|instagram|twitter|^t\.co$|(^|\.)x\.com$|linkedin|youtube|reddit|pinterest|snapchat|threads)/i;
export const SOURCE_CLASSES = ["Direct / unknown", "Search", "Social", "Telegram", "WhatsApp", "Other referral"] as const;
/** Only what the record proves: no referrer and no channel is "Direct / unknown" (it also covers in-site navigation). */
export function classifySource(host: string | null | undefined, channel: string | null | undefined): (typeof SOURCE_CLASSES)[number] {
  const c = (channel ?? "").toLowerCase(), h = (host ?? "").toLowerCase();
  if (c.includes("telegram") || h === "t.me" || h.endsWith("telegram.org")) return "Telegram";
  if (c.includes("whatsapp") || h.endsWith("whatsapp.com") || h === "wa.me") return "WhatsApp";
  if (!h) return "Direct / unknown";
  if (SEARCH.test(h)) return "Search";
  if (SOCIAL.test(h)) return "Social";
  return "Other referral";
}

async function dealLookup(db: Db, ids: string[]) {
  const rows = ids.length ? await db.deal.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, mediaId: true, status: true, merchant: { select: { name: true } }, category: { select: { name: true } } } }) : [];
  return new Map(rows.map((d) => [d.id, { slug: d.slug, title: d.title, image: `/api/v1/media/${d.mediaId}`, status: d.status, merchant: d.merchant.name, category: d.category.name }]));
}

/** Visits (accepted analytics only), newest first. Visitor label is the first name for signed-in members, otherwise Anonymous. */
export async function recentVisits(range: DateRange, page = 1, take = 25) {
  const db = getDatabase();
  const where = { startedAt: between(range) };
  const [rows, total] = await Promise.all([db.analyticsSession.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * take, take }), db.analyticsSession.count({ where })]);
  const ids = rows.map((s) => s.customerId).filter((x): x is string => Boolean(x));
  const names = new Map((ids.length ? await db.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((c) => [c.id, firstName(c.name)]));
  return {
    total, page, pageSize: take,
    items: rows.map((s) => ({ id: s.id, startedAt: s.startedAt.toISOString(), visitor: s.customerId ? names.get(s.customerId) ?? "Member" : "Anonymous", returning: s.returning, source: s.referrerHost ?? s.utmSource ?? s.channel ?? "Direct", pages: s.pageCount, seconds: s.activeSeconds, device: s.deviceType, browser: s.browser, os: s.os, entry: s.entryPath })),
  };
}

async function dailyCounts(db: Db, range: DateRange, types: string[]) {
  const rows = await db.$queryRaw<{ d: unknown; t: string; n: unknown }[]>(Prisma.sql`
    SELECT ${istDay()} AS d, ${col("type")} AS t, COUNT(*) AS n FROM ${table("AnalyticsEvent")}
    WHERE ${col("type")} IN (${Prisma.join(types)}) AND ${inRange(range)} GROUP BY d, t`);
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) { const k = dayKey(r.d); byDay.set(k, { ...(byDay.get(k) ?? {}), [r.t]: num(r.n) }); }
  return dayKeys(range).map((date) => ({ date, ...Object.fromEntries(types.map((t) => [t, byDay.get(date)?.[t] ?? 0])) } as { date: string } & Record<string, number>));
}

/** Heat map of any event types by IST weekday and hour. */
async function heatFor(db: Db, range: DateRange, types: string[]) {
  const rows = await db.$queryRaw<{ dow: unknown; hr: unknown; n: unknown }[]>(Prisma.sql`
    SELECT ${istDow()} AS dow, ${istHour()} AS hr, COUNT(*) AS n FROM ${table("AnalyticsEvent")}
    WHERE ${col("type")} IN (${Prisma.join(types)}) AND ${inRange(range)} GROUP BY dow, hr`);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) grid[num(r.dow)][num(r.hr)] = num(r.n);
  return grid;
}

async function classes(db: Db, range: DateRange) {
  const rows = await db.$queryRaw<{ d: unknown; h: string | null; c: string | null; n: unknown }[]>(Prisma.sql`
    SELECT ${istDay()} AS d, ${col("referrerHost")} AS h, ${col("channel")} AS c, COUNT(*) AS n FROM ${table("AnalyticsEvent")}
    WHERE ${col("type")} = 'PAGE_VIEW' AND ${inRange(range)} GROUP BY d, h, c`);
  const totals: Record<string, number> = Object.fromEntries(SOURCE_CLASSES.map((k) => [k, 0]));
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = classifySource(r.h, r.c), day = dayKey(r.d);
    totals[k] += num(r.n);
    const rec = byDay.get(day) ?? Object.fromEntries(SOURCE_CLASSES.map((s) => [s, 0]));
    rec[k] += num(r.n); byDay.set(day, rec);
  }
  return { totals: SOURCE_CLASSES.map((name) => ({ name, count: totals[name] })), daily: dayKeys(range).map((date) => ({ date, ...(byDay.get(date) ?? Object.fromEntries(SOURCE_CLASSES.map((s) => [s, 0]))) })) as ({ date: string } & Record<string, number>)[] };
}

export async function overviewTab(range: DateRange) {
  const db = getDatabase();
  const base = await getDashboard(range);
  const [src, visits, engagedDeals] = await Promise.all([classes(db, range), recentVisits(range, 1, 5), dealLookup(db, base.topDeals.slice(0, 5).map((d) => d.id))]);
  const commissionStep = base.funnel[3];
  return {
    ...base,
    topDeals: base.topDeals.slice(0, 5).map((d) => ({ ...d, image: engagedDeals.get(d.id)?.image ?? null })),
    topCategories: base.topCategories.slice(0, 5),
    sourceClasses: src.totals, visits: visits.items,
    commissionNote: commissionStep.count ? null : "No approved or paid commission reported in this period.",
  };
}

export async function audienceTab(range: DateRange, page = 1) {
  const db = getDatabase();
  const t = between(range);
  const [dash, daily, heat, visits, newV, retV, landing, browsers, systems] = await Promise.all([
    getDashboard(range), series(db, range), heatmap(db, range), recentVisits(range, page, 25),
    db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorKey")}) AS n FROM ${table("AnalyticsSession")} WHERE ${col("visitorKey")} IS NOT NULL AND ${col("returning")} = ${false} AND ${col("startedAt")} >= ${range.from} AND ${col("startedAt")} < ${range.to}`),
    db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorKey")}) AS n FROM ${table("AnalyticsSession")} WHERE ${col("visitorKey")} IS NOT NULL AND ${col("returning")} = ${true} AND ${col("startedAt")} >= ${range.from} AND ${col("startedAt")} < ${range.to}`),
    db.analyticsSession.groupBy({ by: ["entryPath"], where: { startedAt: t }, _count: { _all: true }, _avg: { pageCount: true, activeSeconds: true }, orderBy: { _count: { id: "desc" } }, take: 15 }),
    db.analyticsSession.groupBy({ by: ["browser"], where: { startedAt: t }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
    db.analyticsSession.groupBy({ by: ["os"], where: { startedAt: t }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
  ]);
  const c = dash.current, p = dash.previous;
  return {
    range: dash.range, current: c, previous: p, newVisitors: num(newV[0]?.n), returningVisitors: num(retV[0]?.n), series: daily, heatmap: heat,
    devices: dash.sources.devices, browsers: browsers.map((b) => ({ name: b.browser, count: b._count._all })), systems: systems.map((b) => ({ name: b.os, count: b._count._all })),
    landing: landing.map((l) => ({ path: l.entryPath, sessions: l._count._all, avgPages: Number((l._avg.pageCount ?? 0).toFixed(1)), avgSeconds: Math.round(l._avg.activeSeconds ?? 0) })),
    visits, note: "Sessions, time on site, new/returning and browser/OS figures cover only visitors who accepted analytics.",
  };
}

export async function dealsTab(range: DateRange, filters: DealFilters) {
  const db = getDatabase();
  const where: Prisma.DealWhereInput = {
    ...(filters.merchantId ? { merchantId: filters.merchantId } : {}), ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status && DEAL_STATUSES.includes(filters.status) ? { status: filters.status as never } : {}),
  };
  const filtered = Object.keys(where).length > 0;
  const allowed = filtered ? (await db.deal.findMany({ where, select: { id: true }, take: 5000 })).map((d) => d.id) : null;
  const idCond = allowed ? (allowed.length ? Prisma.sql`AND ${col("dealId")} IN (${Prisma.join(allowed)})` : Prisma.sql`AND 1 = 0`) : Prisma.sql``;
  const sum = (type: string, extra = Prisma.sql``) => Prisma.sql`SUM(CASE WHEN ${col("type")} = ${type} ${extra} THEN 1 ELSE 0 END)`;
  const [rows, trend, merchants, categories] = await Promise.all([
    db.$queryRaw<{ id: string; views: unknown; visitors: unknown; clicks: unknown; coupons: unknown }[]>(Prisma.sql`
      SELECT ${col("dealId")} AS id, ${sum("PAGE_VIEW", Prisma.sql`AND ${col("pageType")} = 'deal'`)} AS views,
             COUNT(DISTINCT CASE WHEN ${col("type")} = 'PAGE_VIEW' AND ${col("pageType")} = 'deal' THEN ${col("visitorHash")} END) AS visitors,
             ${sum("BUY_CLICK")} AS clicks, ${sum("COUPON_COPY")} AS coupons
      FROM ${table("AnalyticsEvent")} WHERE ${col("dealId")} IS NOT NULL ${idCond} AND ${inRange(range)} GROUP BY ${col("dealId")}
      ORDER BY (${sum("PAGE_VIEW", Prisma.sql`AND ${col("pageType")} = 'deal'`)} + 3 * ${sum("BUY_CLICK")}) DESC LIMIT 200`),
    db.$queryRaw<{ d: unknown; views: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT ${istDay()} AS d, ${sum("PAGE_VIEW", Prisma.sql`AND ${col("pageType")} = 'deal'`)} AS views, ${sum("BUY_CLICK")} AS clicks
      FROM ${table("AnalyticsEvent")} WHERE ${col("dealId")} IS NOT NULL ${idCond} AND ${inRange(range)} GROUP BY d`),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const info = await dealLookup(db, rows.map((r) => r.id));
  const catRows = await db.deal.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, categoryId: true } });
  const catOf = new Map(catRows.map((d) => [d.id, d.categoryId]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const deals = rows.map((r) => {
    const i = info.get(r.id), views = num(r.views), clicks = num(r.clicks);
    return { id: r.id, slug: i?.slug ?? null, title: i?.title ?? "(deleted deal)", image: i?.image ?? null, merchant: i?.merchant ?? "", category: i?.category ?? "", status: i?.status ?? "", views, visitors: num(r.visitors), clicks, ctr: pct(clicks, views), coupons: num(r.coupons) };
  });
  const perCategory = new Map<string, { name: string; views: number; clicks: number }>();
  for (const d of deals) { const name = catName.get(catOf.get(d.id) ?? "") ?? "Other"; const e = perCategory.get(name) ?? { name, views: 0, clicks: 0 }; e.views += d.views; e.clicks += d.clicks; perCategory.set(name, e); }
  const byDay = new Map(trend.map((r) => [dayKey(r.d), { views: num(r.views), clicks: num(r.clicks) }]));
  const totalViews = deals.reduce((a, d) => a + d.views, 0), totalClicks = deals.reduce((a, d) => a + d.clicks, 0);
  const dealVisitors = await db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'PAGE_VIEW' AND ${col("pageType")} = 'deal' ${idCond} AND ${inRange(range)}`);
  const clickVisitors = await db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'BUY_CLICK' ${idCond} AND ${inRange(range)}`);
  const totalCoupons = deals.reduce((a, d) => a + d.coupons, 0);
  return {
    kpis: { views: totalViews, uniqueVisitors: num(dealVisitors[0]?.n), clicks: totalClicks, ctr: pct(totalClicks, totalViews), coupons: totalCoupons, top: deals[0]?.title ?? null },
    series: dayKeys(range).map((date) => ({ date, views: byDay.get(date)?.views ?? 0, clicks: byDay.get(date)?.clicks ?? 0 })),
    categories: [...perCategory.values()].sort((a, b) => b.views - a.views).map((c) => ({ ...c, ctr: pct(c.clicks, c.views) })).slice(0, 10),
    funnel: [{ step: "Deal page visitors", count: num(dealVisitors[0]?.n) }, { step: "Clicked Buy Now", count: num(clickVisitors[0]?.n) }],
    deals, options: { merchants, categories, statuses: DEAL_STATUSES }, note: rawNote(range),
  };
}

export async function engagementTab(range: DateRange) {
  const db = getDatabase();
  const types = ["LIKE", "SHARE", "COMMENT", "COUPON_COPY", "MODAL_OPEN"];
  const created = { gte: range.from, lt: range.to };
  const [daily, heat, rows, posts, comments, topPosts, communityViews] = await Promise.all([
    dailyCounts(db, range, types), heatFor(db, range, types),
    db.$queryRaw<{ id: string; likes: unknown; shares: unknown; comments: unknown; coupons: unknown; opens: unknown }[]>(Prisma.sql`
      SELECT ${col("dealId")} AS id, SUM(CASE WHEN ${col("type")} = 'LIKE' THEN 1 ELSE 0 END) AS likes, SUM(CASE WHEN ${col("type")} = 'SHARE' THEN 1 ELSE 0 END) AS shares,
             SUM(CASE WHEN ${col("type")} = 'COMMENT' THEN 1 ELSE 0 END) AS comments, SUM(CASE WHEN ${col("type")} = 'COUPON_COPY' THEN 1 ELSE 0 END) AS coupons,
             SUM(CASE WHEN ${col("type")} = 'MODAL_OPEN' THEN 1 ELSE 0 END) AS opens
      FROM ${table("AnalyticsEvent")} WHERE ${col("dealId")} IS NOT NULL AND ${col("type")} IN (${Prisma.join(types)}) AND ${inRange(range)}
      GROUP BY ${col("dealId")} ORDER BY COUNT(*) DESC LIMIT 15`),
    db.forumPost.count({ where: { createdAt: created, status: "PUBLISHED" } }),
    db.forumComment.count({ where: { createdAt: created, status: "PUBLISHED" } }),
    db.forumPost.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ viewCount: "desc" }], take: 10, select: { id: true, slug: true, title: true, viewCount: true, commentCount: true, likeCount: true } }),
    db.analyticsEvent.count({ where: { createdAt: created, type: "PAGE_VIEW", path: { startsWith: "/community" } } }),
  ]);
  const totals = Object.fromEntries(types.map((t) => [t, daily.reduce((a, d) => a + (d[t] ?? 0), 0)])) as Record<string, number>;
  const info = await dealLookup(db, rows.map((r) => r.id));
  return {
    kpis: { likes: totals.LIKE, shares: totals.SHARE, commentOpens: totals.COMMENT, coupons: totals.COUPON_COPY, modalOpens: totals.MODAL_OPEN, discussionsCreated: posts, commentsPosted: comments, communityViews },
    series: daily, distribution: [{ name: "Helpful votes / likes", count: totals.LIKE }, { name: "Shares", count: totals.SHARE }, { name: "Comment opens", count: totals.COMMENT }, { name: "Coupon copies", count: totals.COUPON_COPY }, { name: "Deal popup opens", count: totals.MODAL_OPEN }],
    heatmap: heat,
    deals: rows.map((r) => ({ id: r.id, title: info.get(r.id)?.title ?? "(deleted deal)", merchant: info.get(r.id)?.merchant ?? "", likes: num(r.likes), shares: num(r.shares), comments: num(r.comments), coupons: num(r.coupons), opens: num(r.opens), total: num(r.likes) + num(r.shares) + num(r.comments) + num(r.coupons) + num(r.opens) })),
    discussions: topPosts.map((p) => ({ id: p.id, slug: p.slug, title: p.title, views: p.viewCount, comments: p.commentCount, likes: p.likeCount })),
    note: [rawNote(range), "Discussion views, comments and likes in the discussions table are all-time counters; discussions and comments created use the selected dates."].filter(Boolean).join(" "),
  };
}

export async function revenueTab(range: DateRange) {
  const db = getDatabase();
  const when = { gte: range.from, lt: range.to };
  const [clickDaily, clickMerchants, txs] = await Promise.all([
    db.$queryRaw<{ d: unknown; n: unknown }[]>(Prisma.sql`SELECT ${istDay()} AS d, COUNT(*) AS n FROM ${table("AffiliateClick")} WHERE ${inRange(range)} GROUP BY d`),
    db.affiliateClick.groupBy({ by: ["merchantId"], where: { createdAt: when }, _count: { _all: true } }),
    db.affiliateTransaction.findMany({ where: { reportedAt: when }, select: { status: true, commissionMinor: true, reportedAt: true, dealId: true, provider: true }, take: 20_000 }),
  ]);
  const dealIds = [...new Set(txs.map((t) => t.dealId).filter((x): x is string => Boolean(x)))];
  const deals = dealIds.length ? await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, merchantId: true } }) : [];
  const merchantOf = new Map(deals.map((d) => [d.id, d.merchantId]));
  const names = new Map((await db.merchant.findMany({ select: { id: true, name: true } })).map((m) => [m.id, m.name]));
  const bucket = (s: string) => (s === "APPROVED" || s === "PAID" ? "approved" : s === "PENDING" ? "pending" : "rejected");
  const zero = () => ({ orders: 0, pending: 0, approved: 0, rejected: 0, pendingMinor: 0, approvedMinor: 0, rejectedMinor: 0 });
  const total = zero();
  const perMerchant = new Map<string, ReturnType<typeof zero> & { name: string; clicks: number }>();
  const perDay = new Map<string, { approved: number; pending: number; rejected: number }>();
  const entry = (key: string, name: string) => perMerchant.get(key) ?? perMerchant.set(key, { ...zero(), name, clicks: 0 }).get(key)!;
  for (const c of clickMerchants) entry(c.merchantId, names.get(c.merchantId) ?? "(deleted store)").clicks = c._count._all;
  for (const t of txs) {
    const b = bucket(t.status), mid = t.dealId ? merchantOf.get(t.dealId) : undefined, e = entry(mid ?? "none", mid ? names.get(mid) ?? "(deleted store)" : "Not linked to a store");
    for (const o of [total, e]) { o.orders++; o[b]++; o[`${b}Minor` as "approvedMinor"] += t.commissionMinor; }
    const k = istKey(t.reportedAt), d = perDay.get(k) ?? { approved: 0, pending: 0, rejected: 0 }; d[b] += t.commissionMinor; perDay.set(k, d);
  }
  const clicks = clickDaily.reduce((a, r) => a + num(r.n), 0);
  const clickBy = new Map(clickDaily.map((r) => [dayKey(r.d), num(r.n)]));
  return {
    kpis: { clicks, orders: total.orders, pendingMinor: total.pendingMinor, approvedMinor: total.approvedMinor, rejectedMinor: total.rejectedMinor, rejectedOrders: total.rejected, earningsPerClickMinor: clicks ? Math.round(total.approvedMinor / clicks) : null },
    clicksSeries: dayKeys(range).map((date) => ({ date, clicks: clickBy.get(date) ?? 0 })),
    commissionSeries: dayKeys(range).map((date) => ({ date, ...(perDay.get(date) ?? { approved: 0, pending: 0, rejected: 0 }) })),
    status: [{ name: "Approved / paid", count: total.approved, minor: total.approvedMinor }, { name: "Pending", count: total.pending, minor: total.pendingMinor }, { name: "Rejected / cancelled", count: total.rejected, minor: total.rejectedMinor }],
    funnel: [{ step: "Outbound clicks", count: clicks }, { step: "Orders reported", count: total.orders }, { step: "Approved / paid", count: total.approved }],
    merchants: [...perMerchant.values()].filter((m) => m.clicks || m.orders).sort((a, b) => b.approvedMinor - a.approvedMinor || b.clicks - a.clicks).map((m) => ({ ...m, earningsPerClickMinor: m.clicks ? Math.round(m.approvedMinor / m.clicks) : null })),
    note: "Order value is not stored in the transaction records, so it is not shown. Commission is only what the affiliate network reported and was entered or imported; rejected and cancelled orders are never counted as earned.",
  };
}

export async function sourcesTab(range: DateRange) {
  const db = getDatabase();
  const clickSub = Prisma.sql`(SELECT ${col("sessionId")} AS sid, COUNT(*) AS c FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'BUY_CLICK' AND ${col("sessionId")} IS NOT NULL AND ${inRange(range)} GROUP BY ${col("sessionId")})`;
  const [cls, referrers, channelRows, table_, landing, dash] = await Promise.all([
    classes(db, range),
    db.analyticsEvent.groupBy({ by: ["referrerHost"], where: { createdAt: between(range), type: "PAGE_VIEW", referrerHost: { not: null } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    db.$queryRaw<{ ch: string; views: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT ${col("channel")} AS ch, SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END) AS clicks
      FROM ${table("AnalyticsEvent")} WHERE ${col("channel")} IS NOT NULL AND ${col("type")} IN ('PAGE_VIEW', 'BUY_CLICK') AND ${inRange(range)} GROUP BY ${col("channel")} ORDER BY views DESC LIMIT 12`),
    db.$queryRaw<{ h: string | null; us: string | null; um: string | null; uc: string | null; ch: string | null; sessions: unknown; visitors: unknown; pages: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT s.${col("referrerHost")} AS h, s.${col("utmSource")} AS us, s.${col("utmMedium")} AS um, s.${col("utmCampaign")} AS uc, s.${col("channel")} AS ch,
             COUNT(*) AS sessions, COUNT(DISTINCT s.${col("visitorKey")}) AS visitors, SUM(s.${col("pageCount")}) AS pages, SUM(COALESCE(c.c, 0)) AS clicks
      FROM ${table("AnalyticsSession")} s LEFT JOIN ${clickSub} c ON c.sid = s.${col("id")}
      WHERE s.${col("startedAt")} >= ${range.from} AND s.${col("startedAt")} < ${range.to}
      GROUP BY s.${col("referrerHost")}, s.${col("utmSource")}, s.${col("utmMedium")}, s.${col("utmCampaign")}, s.${col("channel")} ORDER BY sessions DESC LIMIT 50`),
    db.$queryRaw<{ path: string; views: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT ${col("path")} AS path, SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END) AS clicks
      FROM ${table("AnalyticsEvent")} WHERE ${col("type")} IN ('PAGE_VIEW', 'BUY_CLICK') AND (${col("referrerHost")} IS NOT NULL OR ${col("channel")} IS NOT NULL) AND ${inRange(range)}
      GROUP BY ${col("path")} ORDER BY views DESC LIMIT 10`),
    db.analyticsSession.count({ where: { startedAt: between(range), utmCampaign: { not: null } } }),
  ]);
  const count = (name: string) => cls.totals.find((c) => c.name === name)?.count ?? 0;
  const views = cls.totals.reduce((a, c) => a + c.count, 0);
  const visitors = await db.$queryRaw<{ n: unknown }[]>(Prisma.sql`SELECT COUNT(DISTINCT ${col("visitorHash")}) AS n FROM ${table("AnalyticsEvent")} WHERE ${col("type")} = 'PAGE_VIEW' AND ${inRange(range)}`);
  return {
    kpis: { visitors: num(visitors[0]?.n), views, direct: count("Direct / unknown"), search: count("Search"), social: count("Social") + count("Telegram") + count("WhatsApp"), referral: count("Other referral"), campaignSessions: dash },
    classes: cls.totals, daily: cls.daily,
    referrers: referrers.map((r) => ({ name: r.referrerHost ?? "", count: r._count._all })),
    channels: channelRows.map((r) => ({ name: r.ch, views: num(r.views), clicks: num(r.clicks), ctr: pct(num(r.clicks), num(r.views)) })),
    landing: landing.map((l) => ({ path: l.path, views: num(l.views), clicks: num(l.clicks), ctr: pct(num(l.clicks), num(l.views)) })),
    table: table_.map((r) => ({ source: r.us ?? r.h ?? r.ch ?? "Direct / unknown", medium: r.um ?? (r.h ? "referral" : r.ch ? "channel" : "none"), campaign: r.uc ?? "", visitors: num(r.visitors), sessions: num(r.sessions), pages: num(r.pages), clicks: num(r.clicks), clicksPerSession: num(r.sessions) ? Number((num(r.clicks) / num(r.sessions)).toFixed(2)) : 0 })),
    note: "'Direct / unknown' includes visits with no referrer and in-site navigation. Source, medium, campaign and visit counts cover visitors who accepted analytics.",
  };
}

export async function getTab(tab: Tab, range: DateRange, opts: { page?: number; filters?: DealFilters } = {}) {
  switch (tab) {
    case "overview": return overviewTab(range);
    case "audience": return audienceTab(range, opts.page ?? 1);
    case "deals": return dealsTab(range, opts.filters ?? {});
    case "engagement": return engagementTab(range);
    case "revenue": return revenueTab(range);
    case "sources": return sourcesTab(range);
  }
}

// ---- CSV ----
type Section = { title: string; headers: string[]; rows: (string | number | null)[][] };
const cell = (v: string | number | null) => {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheet formula injection from stored text
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (minor: number | null) => (minor === null ? "n/a" : (minor / 100).toFixed(2));
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

export async function exportCsv(tab: Tab, range: DateRange, filters: DealFilters = {}) {
  const sections: Section[] = [];
  const period = `${istKey(range.from)} to ${istKey(new Date(range.to.getTime() - 1))} (IST)`;
  if (tab === "overview") {
    const d = await overviewTab(range), c = d.current;
    sections.push({ title: "Key numbers", headers: ["Metric", "Value"], rows: [["Page views", c.views], ["Visitors (per day)", c.visitors], ["Unique visitors (accepted)", c.uniqueVisitors], ["Sessions (accepted)", c.sessions], ["Avg time on site (s)", c.avgSessionSeconds], ["Pages per session", c.pagesPerSession], ["Buy Now clicks", c.buyClicks], ["CTR %", c.ctr], ["Approved commission (INR)", money(c.commissionMinor)]] });
    sections.push({ title: "Daily trend", headers: ["Date", "Page views", "Visitors", "Buy Now clicks"], rows: d.series.map((s) => [s.date, s.views, s.visitors, s.clicks]) });
    sections.push({ title: "Top deals", headers: ["Deal", "Views", "Buy Now clicks", "CTR %"], rows: d.topDeals.map((x) => [x.name, x.views, x.clicks, x.ctr]) });
    sections.push({ title: "Traffic sources", headers: ["Source", "Page views"], rows: d.sourceClasses.map((s) => [s.name, s.count]) });
  } else if (tab === "audience") {
    const d = await audienceTab(range, 1);
    sections.push({ title: "Landing pages", headers: ["Page", "Sessions", "Avg pages", "Avg active seconds"], rows: d.landing.map((l) => [l.path, l.sessions, l.avgPages, l.avgSeconds]) });
    sections.push({ title: "Devices (page views)", headers: ["Device", "Page views"], rows: d.devices.map((x) => [x.name, x.count]) });
    sections.push({ title: "Browsers (accepted sessions)", headers: ["Browser", "Sessions"], rows: d.browsers.map((x) => [x.name, x.count]) });
    sections.push({ title: "Recent visits", headers: ["Started (IST)", "Visitor", "Source", "Pages", "Active seconds", "Device"], rows: d.visits.items.map((v) => [ist(v.startedAt), v.visitor, v.source, v.pages, v.seconds, v.device]) });
  } else if (tab === "deals") {
    const d = await dealsTab(range, filters);
    sections.push({ title: "Deal performance", headers: ["Deal", "Store", "Category", "Status", "Views", "Visitors", "Buy Now clicks", "CTR %", "Coupon copies"], rows: d.deals.map((x) => [x.title, x.merchant, x.category, x.status, x.views, x.visitors, x.clicks, x.ctr, x.coupons]) });
  } else if (tab === "engagement") {
    const d = await engagementTab(range);
    sections.push({ title: "Engagement by deal", headers: ["Deal", "Store", "Likes", "Shares", "Comment opens", "Coupon copies", "Popup opens"], rows: d.deals.map((x) => [x.title, x.merchant, x.likes, x.shares, x.comments, x.coupons, x.opens]) });
    sections.push({ title: "Discussions (all-time counters)", headers: ["Title", "Views", "Comments", "Likes"], rows: d.discussions.map((x) => [x.title, x.views, x.comments, x.likes]) });
  } else if (tab === "revenue") {
    const d = await revenueTab(range);
    sections.push({ title: "Revenue by store", headers: ["Store", "Outbound clicks", "Orders reported", "Pending (INR)", "Approved (INR)", "Rejected (INR)", "Earnings per click (INR)"], rows: d.merchants.map((m) => [m.name, m.clicks, m.orders, money(m.pendingMinor), money(m.approvedMinor), money(m.rejectedMinor), money(m.earningsPerClickMinor)]) });
    sections.push({ title: "Commission by day", headers: ["Date", "Approved (INR)", "Pending (INR)", "Rejected (INR)"], rows: d.commissionSeries.map((s) => [s.date, money(s.approved), money(s.pending), money(s.rejected)]) });
  } else {
    const d = await sourcesTab(range);
    sections.push({ title: "Sources", headers: ["Source", "Medium", "Campaign", "Visitors", "Sessions", "Page views", "Buy Now clicks", "Clicks per session"], rows: d.table.map((r) => [r.source, r.medium, r.campaign, r.visitors, r.sessions, r.pages, r.clicks, r.clicksPerSession]) });
    sections.push({ title: "Landing pages from external sources", headers: ["Page", "Page views", "Buy Now clicks", "CTR %"], rows: d.landing.map((l) => [l.path, l.views, l.clicks, l.ctr]) });
  }
  const lines = [`MetaDeals4U analytics - ${tab} - ${period}`];
  for (const s of sections) lines.push("", cell(s.title), s.headers.map(cell).join(","), ...s.rows.map((r) => r.map(cell).join(",")));
  return lines.join("\n");
}
