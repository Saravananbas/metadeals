import { communityRead, json } from "@/server/community/http";
import { listCommunities } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => communityRead(request, async (customerId) => json({ data: await listCommunities(customerId) }));
