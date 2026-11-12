import { communityWrite, json } from "@/server/community/http";
import { setSaved } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ref: string }> };
export const PUT = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setSaved(customerId, (await params).ref, true) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setSaved(customerId, (await params).ref, false) }));
