import { communityRead, json } from "@/server/community/http";
import { listDiscussions } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The same filtered, sorted, searchable, page-numbered list the Community page shows, as JSON for the native apps.
 * Query: filter, sort, view (all|mine|saved|following), type, community, q, page, limit. Personal views need a signed-in member.
 */
export const GET = (request: Request) =>
  communityRead(request, async (customerId) => json({ data: await listDiscussions(Object.fromEntries(new URL(request.url).searchParams), customerId) }));
