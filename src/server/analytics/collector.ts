import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { isCrawlerOrPrefetch } from "@/features/affiliate/validation";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { classifyPath, parseUserAgent, referrerHostOf } from "./ua";

export const SESSION_COOKIE = "md_sid";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const CLIENT_EVENT_TYPES = ["PAGE_VIEW", "HEARTBEAT", "COUPON_COPY", "SHARE", "LIKE", "COMMENT", "MODAL_OPEN", "SEARCH"] as const;

export const collectSchema = z.object({
  type: z.enum(CLIENT_EVENT_TYPES),
  path: z.string().min(1).max(300).startsWith("/"),
  referrer: z.string().max(300).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  channel: z.string().max(30).optional(),
  eventId: z.string().max(40).optional(),
  seconds: z.number().int().min(1).max(30).optional(),
  consent: z.boolean(),
  returning: z.boolean().optional(),
  dealSlug: z.string().max(200).optional(),
}).strict();
export type CollectInput = z.infer<typeof collectSchema>;

export type RequestFacts = { ip: string; userAgent: string; host: string | null; purpose: string | null; sessionCookie: string | null };

// shortcut: per-process throttle resets on restart; fine for a single Node instance.
const hits = new Map<string, { count: number; resetAt: number }>();
function allowed(key: string) {
  const now = Date.now(), hit = hits.get(key);
  const entry = hit && hit.resetAt > now ? hit : { count: 0, resetAt: now + 60_000 };
  entry.count += 1;
  hits.set(key, entry);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  return entry.count <= 120;
}

// Daily-rotating anonymous visitor id: counts a person once per day and cannot be linked across days.
export function visitorHash(ip: string, userAgent: string, date = new Date()) {
  return createHmac("sha256", `${getAuthEnv().AUTH_SESSION_SECRET}:analytics:${date.toISOString().slice(0, 10)}`)
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

const dealCache = new Map<string, { at: number; deal: { id: string; merchantId: string; categoryId: string } | null }>();
async function lookupDeal(slug: string) {
  const cached = dealCache.get(slug);
  if (cached && Date.now() - cached.at < 60_000) return cached.deal;
  const deal = await getDatabase().deal.findFirst({ where: { OR: [{ slug }, { id: slug }] }, select: { id: true, merchantId: true, categoryId: true } });
  dealCache.set(slug, { at: Date.now(), deal });
  if (dealCache.size > 2000) dealCache.clear();
  return deal;
}

async function customerIdFromSession() {
  try {
    const email = (await getServerSession(getCustomerAuthOptions()))?.user?.email;
    return email ? ((await getDatabase().customer.findUnique({ where: { email }, select: { id: true } }))?.id ?? null) : null;
  } catch {
    return null;
  }
}

export type CollectResult = { ok: true; skipped?: boolean; eventId?: string; sessionId?: string | null; clearCookie?: boolean };

export async function collect(input: CollectInput, facts: RequestFacts): Promise<CollectResult> {
  if (isCrawlerOrPrefetch(facts.userAgent || null, facts.purpose) || input.path.startsWith("/admin") || input.path.startsWith("/api")) {
    return { ok: true, skipped: true };
  }
  const hash = visitorHash(facts.ip, facts.userAgent);
  if (!allowed(hash)) return { ok: true, skipped: true };
  const db = getDatabase(), now = new Date(), device = parseUserAgent(facts.userAgent);

  // A session only exists for visitors who accepted analytics cookies.
  let session = input.consent && facts.sessionCookie ? await db.analyticsSession.findUnique({ where: { id: facts.sessionCookie } }) : null;
  if (session && now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS) session = null;

  if (input.type === "HEARTBEAT") {
    if (!session || !input.seconds) return { ok: true, skipped: true, clearCookie: !input.consent };
    await db.analyticsSession.update({ where: { id: session.id }, data: { activeSeconds: { increment: input.seconds }, lastSeenAt: now } });
    if (input.eventId) {
      await db.analyticsEvent.updateMany({ where: { id: input.eventId, sessionId: session.id }, data: { durationSec: { increment: input.seconds } } });
    }
    return { ok: true, sessionId: session.id };
  }

  const { pageType, slug } = classifyPath(input.path);
  const dealKey = slug ?? input.dealSlug;
  const deal = dealKey ? await lookupDeal(dealKey) : null;
  const referrerHost = referrerHostOf(input.referrer, facts.host);

  if (input.consent && !session) {
    session = await db.analyticsSession.create({
      data: {
        entryPath: input.path,
        exitPath: input.path,
        referrerHost,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        channel: input.channel,
        returning: Boolean(input.returning),
        ...device,
        customerId: await customerIdFromSession(),
      },
    });
  } else if (session && !session.customerId && input.type === "PAGE_VIEW") {
    const customerId = await customerIdFromSession();
    if (customerId) await db.analyticsSession.update({ where: { id: session.id }, data: { customerId } });
  }

  const event = await db.analyticsEvent.create({
    data: {
      sessionId: session?.id ?? null,
      visitorHash: hash,
      type: input.type,
      path: input.path,
      pageType,
      dealId: deal?.id,
      merchantId: deal?.merchantId,
      categoryId: deal?.categoryId,
      referrerHost,
      channel: input.channel,
      deviceType: device.deviceType,
    },
    select: { id: true },
  });
  if (session && input.type === "PAGE_VIEW") {
    await db.analyticsSession.update({ where: { id: session.id }, data: { pageCount: { increment: 1 }, exitPath: input.path, lastSeenAt: now } });
  }
  return { ok: true, eventId: event.id, sessionId: session?.id ?? null, clearCookie: !input.consent };
}

/** Called from the /go redirect: ties the Buy Now click to the visit when the visitor accepted cookies. */
export async function recordBuyClick(args: { dealId: string; merchantId: string; channel: string; ip: string; userAgent: string; sessionCookie: string | null }) {
  try {
    const db = getDatabase();
    const deal = await db.deal.findUnique({ where: { id: args.dealId }, select: { categoryId: true, slug: true } });
    const session = args.sessionCookie ? await db.analyticsSession.findUnique({ where: { id: args.sessionCookie }, select: { id: true } }) : null;
    await db.analyticsEvent.create({
      data: {
        sessionId: session?.id ?? null,
        visitorHash: visitorHash(args.ip, args.userAgent),
        type: "BUY_CLICK",
        path: `/go/${deal?.slug ?? args.dealId}`.slice(0, 300),
        pageType: "go",
        dealId: args.dealId,
        merchantId: args.merchantId,
        categoryId: deal?.categoryId,
        channel: args.channel.slice(0, 30),
        deviceType: parseUserAgent(args.userAgent).deviceType,
      },
    });
  } catch {
    // Analytics must never block the redirect.
  }
}
