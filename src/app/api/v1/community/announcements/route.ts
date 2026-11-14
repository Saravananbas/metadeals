import { z } from "zod";
import { communityRead, json } from "@/server/community/http";
import { listPublicAnnouncements } from "@/server/community/announcements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(30).default(10) });

/** Published official announcements. The author is always "MetaDeals4U Team"; no staff data is ever included. */
export const GET = (request: Request) =>
  communityRead(request, async () => {
    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return json({ data: await listPublicAnnouncements(q.limit, q.page) });
  });
