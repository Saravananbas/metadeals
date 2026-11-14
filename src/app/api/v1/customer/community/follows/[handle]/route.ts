import { communityWrite, json } from "@/server/community/http";
import { setFollow } from "@/server/community/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ handle: string }> };
export const PUT = (request: Request, { params }: Ctx) => communityWrite(request, async (customerId) => json({ data: await setFollow(customerId, (await params).handle, true) }));
export const DELETE = (request: Request, { params }: Ctx) => communityWrite(request, async (customerId) => json({ data: await setFollow(customerId, (await params).handle, false) }));
