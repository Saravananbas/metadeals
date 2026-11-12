import { communityRead, json } from "@/server/community/http";
import { getCommunity } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request, { params }: { params: Promise<{ slug: string }> }) =>
  communityRead(request, async (customerId) => json({ data: await getCommunity((await params).slug, customerId) }));
