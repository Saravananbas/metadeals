import { communityWrite, json } from "@/server/community/http";
import { setCommentLike } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
export const PUT = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setCommentLike(customerId, (await params).id, true) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await setCommentLike(customerId, (await params).id, false) }));
