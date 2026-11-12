import { communityRead, json } from "@/server/community/http";
import { getPublicProfile } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request, { params }: { params: Promise<{ handle: string }> }) =>
  communityRead(request, async () => json({ data: await getPublicProfile((await params).handle) }));
