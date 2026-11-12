import { communityRead, json } from "@/server/community/http";
import { listFeed } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) =>
  communityRead(request, async (customerId) => json({ data: await listFeed(Object.fromEntries(new URL(request.url).searchParams), customerId) }));
