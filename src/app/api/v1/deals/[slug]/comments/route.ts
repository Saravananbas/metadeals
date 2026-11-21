import Redis from "ioredis";
import { z } from "zod";
import { listingSchema } from "@/features/deals/validation";
import { getAuthEnv, getRedisEnv, isRedisConfigured } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { hashRateLimitSubject } from "@/server/auth/crypto";
import { readJson, RequestBodyError } from "@/server/auth/request";
import { publicWhere } from "@/server/deals/repository";
import { clientIpFromHeaders } from "@/server/client-ip";
import { getServerSession } from "next-auth";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { assertDeclaredUploadSize } from "@/server/customer/http";
import { normalizeImage, storeImage } from "@/server/storage/media";
import { CustomerError } from "@/server/customer/service";
import { DealError } from "@/server/deals/service";

const commentSelect = {
  id: true, authorName: true, content: true, createdAt: true, imageKey: true, customerId: true, parentId: true,
  customer: { select: { createdAt: true, forumProfile: { select: { handle: true, avatarKey: true, lastSeenAt: true } } } },
  _count: { select: { likes: true } },
} as const;

// Same rule as the messages screen: online only while the member has a live connection open (seen in the last 90 seconds).
const ONLINE_MS = 90_000;

async function viewerId(): Promise<string | null> {
  try { return (await getServerSession(getCustomerAuthOptions()))?.user?.id ?? null; } catch { return null; }
}

type Row = { id: string; authorName: string; content: string; createdAt: Date; imageKey: string | null; customerId: string | null; parentId: string | null; customer: { createdAt: Date; forumProfile: { handle: string; avatarKey: string | null; lastSeenAt: Date | null } | null } | null; _count: { likes: number } };

/** What the page needs for each comment. A member's comment shows their chosen user name, join month and comment count, never their real name or email. */
async function toDto(rows: Row[], viewer: string | null) {
  const db = getDatabase();
  const ids = rows.map((r) => r.id);
  const memberIds = [...new Set(rows.flatMap((r) => (r.customerId ? [r.customerId] : [])))];
  const [liked, counts] = await Promise.all([
    viewer && ids.length ? db.dealCommentLike.findMany({ where: { customerId: viewer, commentId: { in: ids } }, select: { commentId: true } }) : [],
    memberIds.length ? db.dealComment.groupBy({ by: ["customerId"], where: { customerId: { in: memberIds } }, _count: { _all: true } }) : [],
  ]);
  // @user names in the text that belong to a real member (only those become links).
  const MENTION = /(?:^|\s)@([a-z0-9_]{3,30})/gi;
  const tokens = [...new Set(rows.flatMap((r) => [...r.content.matchAll(MENTION)].map((m) => m[1].toLowerCase())))].slice(0, 100);
  const real = new Set(tokens.length ? (await db.forumProfile.findMany({ where: { handle: { in: tokens } }, select: { handle: true } })).map((p) => p.handle) : []);
  const likedSet = new Set(liked.map((l) => l.commentId));
  const countOf = new Map(counts.map((c) => [c.customerId, c._count._all]));
  return rows.map((r) => {
    const profile = r.customer?.forumProfile ?? null;
    return {
      id: r.id, parentId: r.parentId, authorName: r.authorName, content: r.content,
      mentions: [...new Set([...r.content.matchAll(MENTION)].map((m) => m[1].toLowerCase()))].filter((h) => real.has(h)), createdAt: r.createdAt.toISOString(),
      hasImage: Boolean(r.imageKey), likes: r._count.likes, liked: likedSet.has(r.id),
      member: r.customer && profile ? { handle: profile.handle, hasAvatar: Boolean(profile.avatarKey), online: Boolean(profile.lastSeenAt && Date.now() - profile.lastSeenAt.getTime() < ONLINE_MS), joined: r.customer.createdAt.toLocaleDateString("en-IN", { month: "short", year: "numeric" }), comments: countOf.get(r.customerId ?? "") ?? 1 } : null,
    };
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Cache-Control": "no-store",
};
const inputSchema = z.object({
  authorName: z.string().trim().max(80).optional().default("Guest"),
  content: z.string().trim().min(1).max(1000),
  website: z.string().max(200).optional().default(""),
  parentId: z.string().max(191).optional(),
}).strict();

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

async function findPublicDeal(slug: string) {
  return getDatabase().deal.findFirst({
    where: { ...publicWhere(listingSchema.parse({})), OR: [{ slug }, { id: slug }] },
    select: { id: true },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const deal = await findPublicDeal(slug);
    if (!deal) return reply({ ok: false, error: { message: "Deal unavailable." } }, 404);
    const db = getDatabase();
    const [rows, count, viewer] = await Promise.all([
      db.dealComment.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "desc" }, take: 100, select: commentSelect }),
      db.dealComment.count({ where: { dealId: deal.id } }),
      viewerId(),
    ]);
    return reply({ ok: true, data: { comments: await toDto(rows, viewer), count } });
  } catch {
    return reply({ ok: false, error: { message: "Comments are temporarily unavailable." } }, 503);
  }
}

const memoryHits = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const multipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");
    let image: Buffer | null = null;
    let raw: unknown;
    if (multipart) {
      assertDeclaredUploadSize(request, 6 * 1024 * 1024, "The picture must be 5 MB or smaller.");
      const form = await request.formData();
      const file = form.get("image");
      if (file instanceof File && file.size) image = Buffer.from(await file.arrayBuffer());
      raw = { authorName: String(form.get("authorName") ?? ""), content: String(form.get("content") ?? ""), website: String(form.get("website") ?? ""), parentId: String(form.get("parentId") ?? "") || undefined };
    } else raw = await readJson(request);
    const payload = inputSchema.parse(raw);
    const viewer = await viewerId();
    // Only signed-in members can comment (older guest comments stay visible).
    if (!viewer) return reply({ ok: false, error: { message: "Please sign in to comment." } }, 401);
    if (payload.website) return reply({ ok: true, data: { comment: null, count: null } });
    const deal = await findPublicDeal(slug);
    if (!deal) return reply({ ok: false, error: { message: "Deal unavailable." } }, 404);

    const address = clientIpFromHeaders(request.headers) ?? "unknown";
    const { AUTH_SESSION_SECRET } = getAuthEnv();
    const key = `public-comment:${hashRateLimitSubject(`${viewer}:${address.slice(0, 200)}`, AUTH_SESSION_SECRET)}`;
    let allowed = false;
    if (isRedisConfigured()) {
      const redis = new Redis(getRedisEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
      try {
        await redis.connect();
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 3600);
        allowed = count <= 30;
      } finally {
        redis.disconnect();
      }
    } else {
      // shortcut: per-process counter resets on restart, fine for one Node instance.
      const now = Date.now();
      const hit = memoryHits.get(key);
      const entry = hit && hit.resetAt > now ? hit : { count: 0, resetAt: now + 3600_000 };
      entry.count += 1;
      memoryHits.set(key, entry);
      if (memoryHits.size > 5000) for (const [k, v] of memoryHits) if (v.resetAt <= now) memoryHits.delete(k);
      allowed = entry.count <= 30;
    }
    if (!allowed) return reply({ ok: false, error: { message: "Too many comments. Please try again later." } }, 429);

    const db = getDatabase();
    // A reply is attached to the comment it answers, only within this deal. Threads go 6 reply levels deep (7 with the top comment); a reply to a comment at the last level joins that level.
    let parentId: string | null = null;
    if (payload.parentId) {
      let parent = await db.dealComment.findFirst({ where: { id: payload.parentId, dealId: deal.id }, select: { id: true, parentId: true } });
      if (!parent) return reply({ ok: false, error: { message: "The comment you are replying to is no longer available." } }, 404);
      const chain = [parent.id];
      while (parent.parentId && chain.length < 10) {
        const up: { id: string; parentId: string | null } | null = await db.dealComment.findFirst({ where: { id: parent.parentId, dealId: deal.id }, select: { id: true, parentId: true } });
        if (!up) break;
        chain.push(up.id); parent = up;
      }
      // chain[0] is the comment answered; chain.length is its level (1 = top). At level 7 or more the reply becomes its sibling.
      parentId = chain.length >= 7 ? (chain[1] ?? chain[0]) : chain[0];
    }
    let stored: { storageKey: string; provider: string } | null = null;
    if (image) stored = await storeImage((await normalizeImage(image)).bytes);
    // A signed-in member's comment is tied to their account and shows their user name; a guest's shows the name they typed.
    const member = viewer ? await db.customer.findUnique({ where: { id: viewer }, select: { disabledAt: true, forumProfile: { select: { handle: true } } } }) : null;
    if (member?.disabledAt) return reply({ ok: false, error: { message: "This account cannot comment." } }, 403);
    const created = await db.dealComment.create({
      data: { dealId: deal.id, parentId, customerId: viewer, authorName: member?.forumProfile?.handle ?? "Member", content: payload.content, imageKey: stored?.storageKey ?? null, imageProvider: stored?.provider ?? null },
      select: commentSelect,
    });
    const count = await db.dealComment.count({ where: { dealId: deal.id } });
    return reply({ ok: true, data: { comment: (await toDto([created], viewer))[0], count } }, 201);
  } catch (error) {
    if (error instanceof CustomerError) return reply({ ok: false, error: { message: error.message } }, error.status);
    if (error instanceof DealError) return reply({ ok: false, error: { message: error.message } }, error.status);
    if (error instanceof RequestBodyError) return reply({ ok: false, error: { message: error.message } }, 400);
    if (error instanceof z.ZodError) return reply({ ok: false, error: { message: "Enter a comment of up to 1000 characters." } }, 400);
    return reply({ ok: false, error: { message: "Comments are temporarily unavailable." } }, 503);
  }
}
