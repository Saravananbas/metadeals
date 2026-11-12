import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { istStartOfDay, RAW_RETENTION_DAYS } from "./queries";

const DAY_MS = 86_400_000;
const MAX_DAYS_PER_RUN = 120;
const isMysql = () => (process.env.DATABASE_PROVIDER ?? (process.env.DATABASE_URL?.startsWith("mysql:") ? "mysql" : "postgresql")) === "mysql";
const table = (name: string) => Prisma.raw(isMysql() ? `\`${name}\`` : `"${name}"`);
const col = (name: string) => Prisma.raw(isMysql() ? `\`${name}\`` : `"${name}"`);
const num = (value: unknown) => Number(value ?? 0);

/**
 * Sums raw events into AnalyticsDaily (one "total" row per Indian calendar day, plus per-store and per-deal rows),
 * then deletes raw events and sessions older than the retention window. Safe to run repeatedly (upserts).
 */
export async function runAnalyticsRollup(now = new Date()) {
  const db = getDatabase();
  const today = istStartOfDay(now);

  const last = await db.analyticsDaily.findFirst({ where: { dimension: "total" }, orderBy: { date: "desc" }, select: { date: true } });
  const firstRaw = await db.analyticsEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  let start = last ? new Date(last.date.getTime()) : firstRaw ? istStartOfDay(firstRaw.createdAt) : today;
  // A DATE column comes back as UTC midnight; convert it to the matching IST day start.
  if (last) start = new Date(start.getTime() - 330 * 60_000);
  start = new Date(Math.max(start.getTime(), today.getTime() - MAX_DAYS_PER_RUN * DAY_MS));

  let rolledDays = 0;
  for (let from = start; from < today; from = new Date(from.getTime() + DAY_MS)) {
    const to = new Date(from.getTime() + DAY_MS);
    const date = new Date(new Date(from.getTime() + 330 * 60_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
    const range = Prisma.sql`${col("createdAt")} >= ${from} AND ${col("createdAt")} < ${to}`;

    const [total] = await db.$queryRaw<{ views: unknown; visitors: unknown; clicks: unknown }[]>(Prisma.sql`
      SELECT SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END) AS views,
             COUNT(DISTINCT CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN ${col("visitorHash")} END) AS visitors,
             SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END) AS clicks
      FROM ${table("AnalyticsEvent")} WHERE ${range}`);
    const sessions = await db.analyticsSession.aggregate({ where: { startedAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { activeSeconds: true } });
    const upsert = (dimension: string, key: string, data: { views: number; visitors: number; sessions: number; clicks: number; activeSeconds: number }) =>
      db.analyticsDaily.upsert({ where: { date_dimension_key: { date, dimension, key } }, create: { date, dimension, key, ...data }, update: data });

    await upsert("total", "all", {
      views: num(total?.views), visitors: num(total?.visitors), clicks: num(total?.clicks), sessions: sessions._count._all, activeSeconds: num(sessions._sum.activeSeconds),
    });

    for (const [dimension, field] of [["merchant", "merchantId"], ["deal", "dealId"]] as const) {
      const rows = await db.$queryRaw<{ id: string; views: unknown; visitors: unknown; clicks: unknown }[]>(Prisma.sql`
        SELECT ${col(field)} AS id,
               SUM(CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN 1 ELSE 0 END) AS views,
               COUNT(DISTINCT CASE WHEN ${col("type")} = 'PAGE_VIEW' THEN ${col("visitorHash")} END) AS visitors,
               SUM(CASE WHEN ${col("type")} = 'BUY_CLICK' THEN 1 ELSE 0 END) AS clicks
        FROM ${table("AnalyticsEvent")} WHERE ${col(field)} IS NOT NULL AND ${range} GROUP BY ${col(field)}`);
      for (const r of rows) await upsert(dimension, r.id, { views: num(r.views), visitors: num(r.visitors), clicks: num(r.clicks), sessions: 0, activeSeconds: 0 });
    }
    rolledDays += 1;
  }

  // Only delete raw rows for days that are already rolled up (everything before today is, after the loop above).
  const cutoff = new Date(Math.min(today.getTime(), now.getTime() - RAW_RETENTION_DAYS * DAY_MS));
  const events = await db.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const oldSessions = await db.analyticsSession.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return { rolledDays, deletedEvents: events.count, deletedSessions: oldSessions.count };
}
