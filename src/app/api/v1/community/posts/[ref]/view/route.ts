import { communityRead, json } from "@/server/community/http";
import { recordPostView } from "@/server/community/service";
import { clientIpFromHeaders } from "@/server/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST so crawlers and link previews that only GET pages never add views.
export const POST = (request: Request, { params }: { params: Promise<{ ref: string }> }) =>
  communityRead(request, async () => json({ data: await recordPostView((await params).ref, { ip: clientIpFromHeaders(request.headers), userAgent: request.headers.get("user-agent") ?? "" }) }));
