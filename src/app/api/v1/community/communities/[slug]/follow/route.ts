import { communityWrite, json } from "@/server/community/http";
import { setFollowing } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };
export const PUT = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setFollowing(customerId, (await params).slug, true) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setFollowing(customerId, (await params).slug, false) }));
