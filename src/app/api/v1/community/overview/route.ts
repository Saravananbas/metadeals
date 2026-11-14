import { communityRead, json } from "@/server/community/http";
import { communityOverview } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Community statistics, trending topics and the signed-in member's own counts (counted from the database). */
export const GET = (request: Request) => communityRead(request, async (customerId) => json({ data: await communityOverview(customerId) }));
