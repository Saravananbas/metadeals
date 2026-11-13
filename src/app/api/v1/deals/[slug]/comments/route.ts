import Redis from "ioredis";
import { z } from "zod";
import { listingSchema } from "@/features/deals/validation";
import { getAuthEnv, getRedisEnv, isRedisConfigured } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { hashRateLimitSubject } from "@/server/auth/crypto";
import { readJson, RequestBodyError } from "@/server/auth/request";
import { publicWhere } from "@/server/deals/repository";
import { clientIpFromHeaders } from "@/server/client-ip";
import { looksLikeStaffName } from "@/features/community/validation";

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
    const [comments, count] = await Promise.all([
      db.dealComment.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, authorName: true, content: true, createdAt: true } }),
      db.dealComment.count({ where: { dealId: deal.id } }),
    ]);
    return reply({ ok: true, data: { comments, count } });
  } catch {
    return reply({ ok: false, error: { message: "Comments are temporarily unavailable." } }, 503);
  }
}

const memoryHits = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const payload = inputSchema.parse(await readJson(request));
    if (looksLikeStaffName(payload.authorName)) return reply({ ok: false, error: { message: "Please choose a different name." } }, 400);
    if (payload.website) return reply({ ok: true, data: { comment: null, count: null } });
    const deal = await findPublicDeal(slug);
    if (!deal) return reply({ ok: false, error: { message: "Deal unavailable." } }, 404);

    const address = clientIpFromHeaders(request.headers) ?? "unknown";
    const { AUTH_SESSION_SECRET } = getAuthEnv();
    const key = `public-comment:${hashRateLimitSubject(address.slice(0, 200), AUTH_SESSION_SECRET)}`;
    let allowed = false;
    if (isRedisConfigured()) {
      const redis = new Redis(getRedisEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
      try {
        await redis.connect();
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 3600);
        allowed = count <= 5;
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
      allowed = entry.count <= 5;
    }
    if (!allowed) return reply({ ok: false, error: { message: "Too many comments. Please try again later." } }, 429);

    const db = getDatabase();
    const comment = await db.dealComment.create({
      data: { dealId: deal.id, authorName: payload.authorName || "Guest", content: payload.content },
      select: { id: true, authorName: true, content: true, createdAt: true },
    });
    const count = await db.dealComment.count({ where: { dealId: deal.id } });
    return reply({ ok: true, data: { comment, count } }, 201);
  } catch (error) {
    if (error instanceof RequestBodyError) return reply({ ok: false, error: { message: error.message } }, 400);
    if (error instanceof z.ZodError) return reply({ ok: false, error: { message: "Enter a comment of up to 1000 characters." } }, 400);
    return reply({ ok: false, error: { message: "Comments are temporarily unavailable." } }, 503);
  }
}
